-- ============================================================================
-- eYoklama v3: Hoca Onay & Çoklu Kurum Kimlik Doğrulama Şeması (Teacher Approvals)
-- Hoca şifresiz T.C. + Kurum Kodu ile kayıt / onay mekanizması
-- Kendinden bağımsızdır: institutions tablosu yoksa otomatik oluşturur,
-- hem active_sessions hem app_sessions ile tam uyumlu çalışır.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. KURUMLAR (INSTITUTIONS) TABLOSU (Yoksa oluşturur)
CREATE TABLE IF NOT EXISTS public.institutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,                  -- Örn: 'default', 'bilfen', 'kabatas'
    name TEXT NOT NULL,                         -- Örn: '1. Kurum', 'Özel Bilgi Koleji'
    teacher_pin TEXT NOT NULL DEFAULT '123456',
    admin_password TEXT NOT NULL DEFAULT 'Admin123456!',
    pin_updated_at TIMESTAMPTZ DEFAULT now(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Varsayılan 1. Kurumu ekle (varsa dokunmaz)
INSERT INTO public.institutions (id, slug, name, teacher_pin, admin_password)
VALUES 
    ('00000000-0000-0000-0000-000000000001'::uuid, 'default', '1. Kurum', '123456', 'Admin123456!')
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name;

-- RLS Güvenliği
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'institutions' AND policyname = 'Allow all access to institutions'
    ) THEN
        CREATE POLICY "Allow all access to institutions" ON public.institutions
            FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 2. HOCA KAYIT VE CİHAZ ONAY TABLOSU
CREATE TABLE IF NOT EXISTS public.teacher_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    tc_no VARCHAR(11) NOT NULL,
    full_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    device_token TEXT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_institution_teacher_tc UNIQUE (institution_id, tc_no)
);

CREATE INDEX IF NOT EXISTS idx_teacher_registrations_inst_tc ON public.teacher_registrations(institution_id, tc_no);
CREATE INDEX IF NOT EXISTS idx_teacher_registrations_status ON public.teacher_registrations(status);

ALTER TABLE public.teacher_registrations ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'teacher_registrations' AND policyname = 'Allow all access to teacher_registrations'
    ) THEN
        CREATE POLICY "Allow all access to teacher_registrations" ON public.teacher_registrations
            FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 3. RPC: Hoca Giriş / Onay Talebi (request_teacher_access)
CREATE OR REPLACE FUNCTION public.request_teacher_access(
    p_institution_slug TEXT,
    p_tc_no TEXT,
    p_full_name TEXT DEFAULT '',
    p_device_token TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_slug TEXT := trim(lower(COALESCE(p_institution_slug, '')));
    v_clean_tc TEXT := regexp_replace(COALESCE(p_tc_no, ''), '\D', '', 'g');
    v_clean_name TEXT := trim(COALESCE(p_full_name, ''));
    v_inst RECORD;
    v_reg RECORD;
    v_new_token TEXT;
    v_expires TIMESTAMPTZ;
BEGIN
    IF v_clean_slug = '' THEN
        v_clean_slug := 'default';
    END IF;

    -- Kurumu bul, yoksa default'a bak, o da yoksa anında oluştur
    SELECT * INTO v_inst FROM public.institutions WHERE lower(slug) = v_clean_slug LIMIT 1;
    IF NOT FOUND THEN
        SELECT * INTO v_inst FROM public.institutions WHERE slug = 'default' LIMIT 1;
        IF NOT FOUND THEN
            INSERT INTO public.institutions (slug, name)
            VALUES (v_clean_slug, initcap(v_clean_slug) || ' Kurumu')
            RETURNING * INTO v_inst;
        END IF;
    END IF;

    IF length(v_clean_tc) <> 11 THEN
        RETURN jsonb_build_object('ok', false, 'status', 'rejected', 'error', 'T.C. Kimlik Numarası 11 haneli olmalıdır.');
    END IF;

    -- Mevcut kayıt var mı?
    SELECT * INTO v_reg FROM public.teacher_registrations 
    WHERE institution_id = v_inst.id AND tc_no = v_clean_tc;

    IF FOUND THEN
        IF v_reg.status = 'approved' THEN
            v_new_token := encode(gen_random_bytes(32), 'hex');
            v_expires := now() + INTERVAL '30 days';

            IF v_clean_name <> '' AND v_clean_name <> v_reg.full_name THEN
                UPDATE public.teacher_registrations SET full_name = v_clean_name, device_token = p_device_token WHERE id = v_reg.id;
                v_reg.full_name := v_clean_name;
            ELSE
                UPDATE public.teacher_registrations SET device_token = p_device_token WHERE id = v_reg.id;
            END IF;

            -- active_sessions tablosuna oturum yaz
            INSERT INTO public.active_sessions (token, role, display_name, device_token, expires_at)
            VALUES (v_new_token, 'teacher', v_reg.full_name, COALESCE(p_device_token, ''), v_expires);

            -- app_sessions tablosu varsa oraya da yaz (tam çift yönlü uyumluluk)
            BEGIN
                INSERT INTO public.app_sessions (institution_id, token_hash, role, display_name, device_token, expires_at)
                VALUES (v_inst.id, v_new_token, 'teacher', v_reg.full_name, COALESCE(p_device_token, ''), v_expires);
            EXCEPTION WHEN undefined_table THEN
                -- app_sessions yoksa sorun yok
            END;

            RETURN jsonb_build_object(
                'ok', true,
                'status', 'approved',
                'token', v_new_token,
                'role', 'teacher',
                'displayName', v_reg.full_name,
                'institutionId', v_inst.id,
                'institutionSlug', v_inst.slug,
                'institutionName', v_inst.name,
                'expiresAt', v_expires
            );
        ELSIF v_reg.status = 'rejected' THEN
            RETURN jsonb_build_object('ok', false, 'status', 'rejected', 'error', 'Bu T.C. için giriş talebi yönetici tarafından reddedildi.');
        ELSE
            -- Halen onay bekliyor
            IF v_clean_name <> '' THEN
                UPDATE public.teacher_registrations SET full_name = v_clean_name, device_token = p_device_token WHERE id = v_reg.id;
            END IF;
            RETURN jsonb_build_object('ok', false, 'status', 'pending', 'message', 'Yöneticinizden onay bekleniyor.');
        END IF;
    ELSE
        -- İlk kayıt talebi
        IF v_clean_name = '' THEN
            RETURN jsonb_build_object('ok', false, 'status', 'rejected', 'error', 'İlk girişte ad ve soyad gereklidir.');
        END IF;

        INSERT INTO public.teacher_registrations (institution_id, tc_no, full_name, status, device_token)
        VALUES (v_inst.id, v_clean_tc, v_clean_name, 'pending', p_device_token);

        RETURN jsonb_build_object('ok', false, 'status', 'pending', 'message', 'Kayıt talebiniz iletildi. Yöneticinizden onay bekleniyor.');
    END IF;
END;
$$;

-- 4. RPC: Hoca Onay Durumu Polling (check_teacher_approval)
CREATE OR REPLACE FUNCTION public.check_teacher_approval(
    p_institution_slug TEXT,
    p_tc_no TEXT,
    p_device_token TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_slug TEXT := trim(lower(COALESCE(p_institution_slug, '')));
    v_clean_tc TEXT := regexp_replace(COALESCE(p_tc_no, ''), '\D', '', 'g');
    v_inst RECORD;
    v_reg RECORD;
    v_new_token TEXT;
    v_expires TIMESTAMPTZ;
BEGIN
    IF v_clean_slug = '' THEN
        v_clean_slug := 'default';
    END IF;

    SELECT * INTO v_inst FROM public.institutions WHERE lower(slug) = v_clean_slug LIMIT 1;
    IF NOT FOUND THEN
        SELECT * INTO v_inst FROM public.institutions WHERE slug = 'default' LIMIT 1;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('approved', false, 'status', 'rejected', 'error', 'Kurum bulunamadı.');
        END IF;
    END IF;

    SELECT * INTO v_reg FROM public.teacher_registrations 
    WHERE institution_id = v_inst.id AND tc_no = v_clean_tc;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('approved', false, 'status', 'not_found', 'error', 'Kayıt bulunamadı.');
    END IF;

    IF v_reg.status = 'approved' THEN
        v_new_token := encode(gen_random_bytes(32), 'hex');
        v_expires := now() + INTERVAL '30 days';

        INSERT INTO public.active_sessions (token, role, display_name, device_token, expires_at)
        VALUES (v_new_token, 'teacher', v_reg.full_name, COALESCE(p_device_token, ''), v_expires);

        BEGIN
            INSERT INTO public.app_sessions (institution_id, token_hash, role, display_name, device_token, expires_at)
            VALUES (v_inst.id, v_new_token, 'teacher', v_reg.full_name, COALESCE(p_device_token, ''), v_expires);
        EXCEPTION WHEN undefined_table THEN
        END;

        RETURN jsonb_build_object(
            'approved', true,
            'status', 'approved',
            'token', v_new_token,
            'role', 'teacher',
            'displayName', v_reg.full_name,
            'institutionId', v_inst.id,
            'institutionSlug', v_inst.slug,
            'institutionName', v_inst.name,
            'expiresAt', v_expires
        );
    ELSIF v_reg.status = 'rejected' THEN
        RETURN jsonb_build_object('approved', false, 'status', 'rejected', 'error', 'Talebiniz yönetici tarafından reddedildi.');
    ELSE
        RETURN jsonb_build_object('approved', false, 'status', 'pending');
    END IF;
END;
$$;

-- 5. RPC: Admin Hoca Onay Listesini Getir (admin_get_teacher_approvals)
CREATE OR REPLACE FUNCTION public.admin_get_teacher_approvals(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
    v_inst_id UUID;
    v_pending JSONB;
    v_approved JSONB;
BEGIN
    -- Önce active_sessions kontrolü
    SELECT * INTO v_session FROM public.active_sessions 
    WHERE token = p_token AND expires_at > now() AND role = 'admin';

    IF NOT FOUND THEN
        -- app_sessions kontrolü
        BEGIN
            SELECT * INTO v_session FROM public.app_sessions 
            WHERE token_hash = p_token AND expires_at > now() AND role = 'admin' AND revoked = false;
        EXCEPTION WHEN undefined_table THEN
        END;
    END IF;

    IF v_session IS NULL THEN
        RAISE EXCEPTION 'Yetkisiz erişim veya oturum süresi dolmuş.';
    END IF;

    -- Kurum ID tespiti
    SELECT id INTO v_inst_id FROM public.institutions WHERE slug = 'default' LIMIT 1;
    IF v_inst_id IS NULL THEN
        SELECT id INTO v_inst_id FROM public.institutions LIMIT 1;
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'institutionId', institution_id,
        'tcNo', tc_no,
        'fullName', full_name,
        'status', status,
        'deviceToken', device_token,
        'approvedAt', approved_at,
        'createdAt', created_at
    ) ORDER BY created_at DESC), '[]'::jsonb)
    INTO v_pending
    FROM public.teacher_registrations
    WHERE status = 'pending';

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'institutionId', institution_id,
        'tcNo', tc_no,
        'fullName', full_name,
        'status', status,
        'deviceToken', device_token,
        'approvedAt', approved_at,
        'createdAt', created_at
    ) ORDER BY full_name ASC), '[]'::jsonb)
    INTO v_approved
    FROM public.teacher_registrations
    WHERE status = 'approved';

    RETURN jsonb_build_object(
        'pending', v_pending,
        'approved', v_approved
    );
END;
$$;

-- 6. RPC: Admin Hoca Onayla / Reddet / Yetki Kaldır (admin_decide_teacher)
CREATE OR REPLACE FUNCTION public.admin_decide_teacher(
    p_token TEXT,
    p_registration_id UUID,
    p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_is_admin BOOLEAN := false;
BEGIN
    SELECT true INTO v_is_admin FROM public.active_sessions 
    WHERE token = p_token AND expires_at > now() AND role = 'admin';

    IF NOT v_is_admin THEN
        BEGIN
            SELECT true INTO v_is_admin FROM public.app_sessions 
            WHERE token_hash = p_token AND expires_at > now() AND role = 'admin' AND revoked = false;
        EXCEPTION WHEN undefined_table THEN
        END;
    END IF;

    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Yetkisiz erişim veya oturum süresi dolmuş.';
    END IF;

    IF p_action = 'approve' THEN
        UPDATE public.teacher_registrations 
        SET status = 'approved', approved_at = now() 
        WHERE id = p_registration_id;
    ELSIF p_action = 'reject' THEN
        UPDATE public.teacher_registrations 
        SET status = 'rejected', approved_at = NULL 
        WHERE id = p_registration_id;
    ELSIF p_action = 'revoke' OR p_action = 'delete' THEN
        DELETE FROM public.teacher_registrations WHERE id = p_registration_id;
    ELSE
        RAISE EXCEPTION 'Geçersiz işlem tipi.';
    END IF;

    RETURN jsonb_build_object('ok', true, 'action', p_action, 'id', p_registration_id);
END;
$$;

-- İzinler
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE public.institutions TO anon, authenticated;
GRANT ALL ON TABLE public.teacher_registrations TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_teacher_access(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_teacher_approval(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_teacher_approvals(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decide_teacher(TEXT, UUID, TEXT) TO anon, authenticated;

-- 7. RPC: app_login (4 parametreli ve kurum destekli güncel versiyon)
CREATE OR REPLACE FUNCTION public.app_login(
    p_name TEXT DEFAULT '',
    p_pin TEXT DEFAULT '',
    p_device_token TEXT DEFAULT '',
    p_institution_slug TEXT DEFAULT 'default'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_name TEXT := trim(COALESCE(p_name, ''));
    v_clean_pin TEXT := trim(COALESCE(p_pin, ''));
    v_clean_slug TEXT := trim(lower(COALESCE(p_institution_slug, '')));
    v_inst RECORD;
    v_admin_pwd TEXT;
    v_teacher_pin TEXT;
    v_new_token TEXT;
    v_expires TIMESTAMPTZ;
    v_existing_session RECORD;
BEGIN
    IF v_clean_slug = '' THEN
        v_clean_slug := 'default';
    END IF;

    -- Kurumu tespit et
    SELECT * INTO v_inst FROM public.institutions WHERE lower(slug) = v_clean_slug LIMIT 1;
    IF NOT FOUND THEN
        SELECT * INTO v_inst FROM public.institutions WHERE slug = 'default' LIMIT 1;
        IF NOT FOUND THEN
            SELECT * INTO v_inst FROM public.institutions LIMIT 1;
        END IF;
    END IF;

    IF v_inst IS NOT NULL THEN
        v_admin_pwd := v_inst.admin_password;
        v_teacher_pin := v_inst.teacher_pin;
    ELSE
        SELECT value INTO v_admin_pwd FROM public.system_settings WHERE key = 'admin_password';
        SELECT value INTO v_teacher_pin FROM public.system_settings WHERE key = 'teacher_pin';
    END IF;

    -- 1. Admin Girişi
    IF v_clean_pin = v_admin_pwd OR (lower(v_clean_name) = 'admin' AND v_clean_pin = v_admin_pwd) THEN
        v_new_token := encode(gen_random_bytes(32), 'hex');
        v_expires := now() + INTERVAL '24 hours';

        INSERT INTO public.active_sessions (token, role, display_name, device_token, expires_at)
        VALUES (v_new_token, 'admin', 'Üst Yönetici', COALESCE(p_device_token, ''), v_expires);

        BEGIN
            INSERT INTO public.app_sessions (institution_id, token_hash, role, display_name, device_token, expires_at)
            VALUES (v_inst.id, v_new_token, 'admin', 'Üst Yönetici', COALESCE(p_device_token, ''), v_expires);
        EXCEPTION WHEN undefined_table THEN
        END;

        RETURN json_build_object(
            'ok', true,
            'role', 'admin',
            'displayName', 'Üst Yönetici',
            'institutionSlug', COALESCE(v_inst.slug, v_clean_slug),
            'institutionName', COALESCE(v_inst.name, 'Kurum'),
            'token', v_new_token,
            'expiresAt', v_expires
        );
    END IF;

    -- 2. Hoca Hatırlanan Oturumla Devam Etme (Ad ve PIN boş geldiğinde)
    IF v_clean_name = '' AND v_clean_pin = '' THEN
        IF p_device_token IS NOT NULL AND p_device_token <> '' THEN
            SELECT * INTO v_existing_session
            FROM public.active_sessions
            WHERE device_token = p_device_token AND role = 'teacher' AND expires_at > now()
            ORDER BY created_at DESC
            LIMIT 1;

            IF FOUND THEN
                v_new_token := encode(gen_random_bytes(32), 'hex');
                v_expires := now() + INTERVAL '7 days';

                INSERT INTO public.active_sessions (token, role, display_name, device_token, expires_at)
                VALUES (v_new_token, 'teacher', v_existing_session.display_name, p_device_token, v_expires);

                RETURN json_build_object(
                    'ok', true,
                    'role', 'teacher',
                    'displayName', v_existing_session.display_name,
                    'token', v_new_token,
                    'teacherWeekEndsAt', v_expires,
                    'expiresAt', v_expires
                );
            END IF;
        END IF;

        RETURN json_build_object('ok', false, 'error', 'Haftalık oturum bulunamadı veya süresi dolmuş.', 'code', 'WEEKLY_PIN_REQUIRED');
    END IF;

    -- 3. Standart Hoca PIN Girişi
    IF v_clean_pin = v_teacher_pin THEN
        IF v_clean_name = '' THEN
            RETURN json_build_object('ok', false, 'error', 'Hoca adını yazın.');
        END IF;

        v_new_token := encode(gen_random_bytes(32), 'hex');
        v_expires := now() + INTERVAL '7 days';

        INSERT INTO public.active_sessions (token, role, display_name, device_token, expires_at)
        VALUES (v_new_token, 'teacher', v_clean_name, COALESCE(p_device_token, ''), v_expires);

        RETURN json_build_object(
            'ok', true,
            'role', 'teacher',
            'displayName', v_clean_name,
            'token', v_new_token,
            'teacherWeekEndsAt', v_expires,
            'expiresAt', v_expires
        );
    END IF;

    RETURN json_build_object('ok', false, 'error', 'Hatalı PIN veya şifre girdiniz.', 'code', 'INVALID_PIN');
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_login(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
