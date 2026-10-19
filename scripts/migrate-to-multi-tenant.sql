-- ============================================================================
-- eYoklama: Tek Veritabanında Çok Kurumlu (Multi-Tenant B2B SaaS) Migrasyonu
-- Bu betik mevcut Supabase projenizde SQL Editor'dan bir kez çalıştırılır.
-- Canlıdaki mevcut verileri KORUR; tüm mevcut sınıfları 1. Kuruma bağlar.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. KURUMLAR (INSTITUTIONS) TABLOSU
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.institutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,                  -- Örn: 'default', 'kurum2', 'bilgi'
    name TEXT NOT NULL,                         -- Örn: '1. Kurum', 'Özel Bilgi Koleji'
    teacher_pin TEXT NOT NULL DEFAULT '123456',
    admin_password TEXT NOT NULL DEFAULT 'Admin123456!',
    pin_updated_at TIMESTAMPTZ DEFAULT now(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Varsayılan 1. Kurum ve 2. Kurumu ekle (varsa dokunmaz)
INSERT INTO public.institutions (id, slug, name, teacher_pin, admin_password)
VALUES 
    ('00000000-0000-0000-0000-000000000001'::uuid, 'default', '1. Kurum', '123456', 'Admin123456!'),
    (gen_random_uuid(), 'kurum2', '2. Kurum', '123456', 'Admin123456!')
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name;

-- ----------------------------------------------------------------------------
-- 2. TABLOLARA institution_id EKLEME & MEVCUT VERİLERİ 1. KURUMA BAĞLAMA
-- ----------------------------------------------------------------------------

-- Sınıf Listeleri (class_lists)
ALTER TABLE IF EXISTS public.class_lists 
ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES public.institutions(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

UPDATE public.class_lists SET institution_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE institution_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_class_lists_inst ON public.class_lists(institution_id);

-- Öğrenciler (students)
ALTER TABLE IF EXISTS public.students 
ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES public.institutions(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

UPDATE public.students SET institution_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE institution_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_students_inst ON public.students(institution_id);

-- Yoklama Kayıtları (attendance_records)
ALTER TABLE IF EXISTS public.attendance_records 
ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES public.institutions(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

UPDATE public.attendance_records SET institution_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE institution_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_records_inst ON public.attendance_records(institution_id);

-- Yoklama Kilitleri (attendance_locks)
ALTER TABLE IF EXISTS public.attendance_locks 
ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES public.institutions(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

-- Aktif Oturumlar (active_sessions)
ALTER TABLE IF EXISTS public.active_sessions 
ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES public.institutions(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
ADD COLUMN IF NOT EXISTS institution_slug TEXT DEFAULT 'default',
ADD COLUMN IF NOT EXISTS institution_name TEXT DEFAULT '1. Kurum';

UPDATE public.active_sessions SET institution_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE institution_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_active_sessions_inst ON public.active_sessions(institution_id);

-- Okul Öğrenci Havuzu (school_students)
ALTER TABLE IF EXISTS public.school_students 
ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES public.institutions(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

UPDATE public.school_students SET institution_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE institution_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_school_students_inst ON public.school_students(institution_id);

-- Not & Kanaat Tablosu (student_grades)
ALTER TABLE IF EXISTS public.student_grades 
ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES public.institutions(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

UPDATE public.student_grades SET institution_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE institution_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_student_grades_inst ON public.student_grades(institution_id);

-- ----------------------------------------------------------------------------
-- 3. GÜNCELLENMİŞ 17 ADET RPC STORED PROCEDURE (KURUM İZOLELİ)
-- ----------------------------------------------------------------------------

-- 1. app_login (Kurum slug desteği ile)
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
    v_target_slug TEXT := lower(trim(COALESCE(NULLIF(p_institution_slug, ''), 'default')));
    v_inst RECORD;
    v_new_token TEXT;
    v_expires TIMESTAMPTZ;
    v_existing_session RECORD;
BEGIN
    -- Hedef kurumu getir
    SELECT * INTO v_inst 
    FROM public.institutions 
    WHERE slug = v_target_slug AND is_active = true;

    IF NOT FOUND THEN
        -- Eğer bulunamadıysa varsayılan kurumu dene
        SELECT * INTO v_inst FROM public.institutions WHERE slug = 'default' AND is_active = true;
        IF NOT FOUND THEN
            RETURN json_build_object('ok', false, 'error', 'Kurum bulunamadı veya sistemde aktif değil.');
        END IF;
    END IF;

    -- A. Üst Yönetici (Admin) Girişi
    IF v_clean_pin = v_inst.admin_password OR (lower(v_clean_name) = 'admin' AND v_clean_pin = v_inst.admin_password) THEN
        v_new_token := encode(gen_random_bytes(32), 'hex');
        v_expires := now() + INTERVAL '24 hours';

        INSERT INTO public.active_sessions (
            token, role, display_name, device_token, institution_id, institution_slug, institution_name, expires_at
        )
        VALUES (
            v_new_token, 'admin', 'Üst Yönetici', COALESCE(p_device_token, ''), v_inst.id, v_inst.slug, v_inst.name, v_expires
        );

        RETURN json_build_object(
            'ok', true,
            'role', 'admin',
            'displayName', 'Üst Yönetici',
            'institutionId', v_inst.id,
            'institutionSlug', v_inst.slug,
            'institutionName', v_inst.name,
            'token', v_new_token,
            'expiresAt', v_expires
        );
    END IF;

    -- B. Hoca Hatırlanan Oturumla Devam Etme (Ad ve PIN boş geldiğinde)
    IF v_clean_name = '' AND v_clean_pin = '' THEN
        IF p_device_token IS NOT NULL AND p_device_token <> '' THEN
            SELECT * INTO v_existing_session
            FROM public.active_sessions
            WHERE device_token = p_device_token 
              AND institution_id = v_inst.id 
              AND role = 'teacher' 
              AND expires_at > now()
            ORDER BY created_at DESC
            LIMIT 1;

            IF FOUND THEN
                v_new_token := encode(gen_random_bytes(32), 'hex');
                v_expires := now() + INTERVAL '7 days';

                INSERT INTO public.active_sessions (
                    token, role, display_name, device_token, institution_id, institution_slug, institution_name, expires_at
                )
                VALUES (
                    v_new_token, 'teacher', v_existing_session.display_name, p_device_token, v_inst.id, v_inst.slug, v_inst.name, v_expires
                );

                RETURN json_build_object(
                    'ok', true,
                    'role', 'teacher',
                    'displayName', v_existing_session.display_name,
                    'institutionId', v_inst.id,
                    'institutionSlug', v_inst.slug,
                    'institutionName', v_inst.name,
                    'token', v_new_token,
                    'teacherWeekEndsAt', v_expires,
                    'expiresAt', v_expires
                );
            END IF;
        END IF;

        RETURN json_build_object('ok', false, 'error', 'Haftalık oturum bulunamadı veya süresi dolmuş.', 'code', 'WEEKLY_PIN_REQUIRED');
    END IF;

    -- C. Standart Hoca Girişi
    IF v_clean_pin = v_inst.teacher_pin THEN
        IF v_clean_name = '' THEN
            RETURN json_build_object('ok', false, 'error', 'Hoca adını yazın.');
        END IF;

        v_new_token := encode(gen_random_bytes(32), 'hex');
        v_expires := now() + INTERVAL '7 days';

        INSERT INTO public.active_sessions (
            token, role, display_name, device_token, institution_id, institution_slug, institution_name, expires_at
        )
        VALUES (
            v_new_token, 'teacher', v_clean_name, COALESCE(p_device_token, ''), v_inst.id, v_inst.slug, v_inst.name, v_expires
        );

        RETURN json_build_object(
            'ok', true,
            'role', 'teacher',
            'displayName', v_clean_name,
            'institutionId', v_inst.id,
            'institutionSlug', v_inst.slug,
            'institutionName', v_inst.name,
            'token', v_new_token,
            'teacherWeekEndsAt', v_expires,
            'expiresAt', v_expires
        );
    END IF;

    RETURN json_build_object('ok', false, 'error', 'Hatalı PIN girdiniz.', 'code', 'INVALID_PIN');
END;
$$;

-- 2. app_bootstrap
CREATE OR REPLACE FUNCTION public.app_bootstrap(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
    v_inst RECORD;
    v_lists JSON;
    v_history JSON;
BEGIN
    SELECT * INTO v_session FROM public.active_sessions WHERE token = p_token AND expires_at > now();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Oturum geçersiz veya süresi dolmuş.';
    END IF;

    SELECT * INTO v_inst FROM public.institutions WHERE id = v_session.institution_id;

    -- Yalnızca bu kurumun sınıf listeleri ve öğrencileri
    SELECT COALESCE(json_agg(json_build_object(
        'id', c.id,
        'name', c.name,
        'createdAt', c.created_at,
        'students', COALESCE((
            SELECT json_agg(json_build_object(
                'id', s.id,
                'firstName', s.first_name,
                'lastName', s.last_name,
                'listId', s.list_id,
                'listName', c.name,
                'tcNo', s.tc_no
            ) ORDER BY s.first_name, s.last_name)
            FROM public.students s
            WHERE s.list_id = c.id AND s.institution_id = v_session.institution_id
        ), '[]'::json)
    ) ORDER BY c.name), '[]'::json)
    INTO v_lists
    FROM public.class_lists c
    WHERE c.institution_id = v_session.institution_id;

    -- Yalnızca bu kurumun geçmiş yoklamaları
    SELECT COALESCE(json_agg(json_build_object(
        'id', r.id,
        'listId', r.list_id,
        'listName', r.list_name,
        'takenAt', r.taken_at,
        'takenByName', r.taken_by_name,
        'archivedAt', r.archived_at
    ) ORDER BY r.taken_at DESC), '[]'::json)
    INTO v_history
    FROM public.attendance_records r
    WHERE r.institution_id = v_session.institution_id;

    RETURN json_build_object(
        'role', v_session.role,
        'displayName', v_session.display_name,
        'institutionId', v_session.institution_id,
        'institutionSlug', v_session.institution_slug,
        'institutionName', v_session.institution_name,
        'lists', v_lists,
        'history', v_history,
        'teacherPin', CASE WHEN v_session.role = 'admin' THEN v_inst.teacher_pin ELSE NULL END,
        'teacherPinDate', CASE WHEN v_session.role = 'admin' THEN to_char(v_inst.pin_updated_at, 'DD.MM.YYYY HH24:MI') ELSE NULL END
    );
END;
$$;

-- 3. begin_attendance
CREATE OR REPLACE FUNCTION public.begin_attendance(p_token TEXT, p_list_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
    v_lock RECORD;
BEGIN
    SELECT * INTO v_session FROM public.active_sessions WHERE token = p_token AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Oturum geçersiz.'; END IF;

    DELETE FROM public.attendance_locks WHERE expires_at < now();

    SELECT * INTO v_lock FROM public.attendance_locks WHERE list_id = p_list_id;
    IF FOUND AND v_lock.token <> p_token THEN
        RETURN json_build_object(
            'ok', false,
            'acquired', false,
            'locked', true,
            'lockedBy', v_lock.locked_by,
            'expiresAt', v_lock.expires_at,
            'error', 'Bu sınıfta şu anda ' || v_lock.locked_by || ' yoklama alıyor.'
        );
    END IF;

    INSERT INTO public.attendance_locks (list_id, token, locked_by, institution_id, expires_at)
    VALUES (p_list_id, p_token, v_session.display_name, v_session.institution_id, now() + INTERVAL '45 seconds')
    ON CONFLICT (list_id) DO UPDATE SET
        token = EXCLUDED.token,
        locked_by = EXCLUDED.locked_by,
        institution_id = EXCLUDED.institution_id,
        expires_at = EXCLUDED.expires_at;

    RETURN json_build_object('ok', true, 'acquired', true);
END;
$$;

-- 4. save_attendance
CREATE OR REPLACE FUNCTION public.save_attendance(
    p_token TEXT,
    p_list_id UUID,
    p_statuses JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
    v_list RECORD;
    v_att_id UUID;
    v_student RECORD;
    v_status TEXT;
BEGIN
    SELECT * INTO v_session FROM public.active_sessions WHERE token = p_token AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Oturum geçersiz.'; END IF;

    SELECT * INTO v_list FROM public.class_lists WHERE id = p_list_id AND institution_id = v_session.institution_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sınıf bulunamadı.'; END IF;

    INSERT INTO public.attendance_records (list_id, list_name, taken_at, taken_by_name, institution_id)
    VALUES (p_list_id, v_list.name, now(), v_session.display_name, v_session.institution_id)
    RETURNING id INTO v_att_id;

    FOR v_student IN SELECT * FROM public.students WHERE list_id = p_list_id AND institution_id = v_session.institution_id
    LOOP
        v_status := COALESCE(p_statuses->>v_student.id::text, 'absent');
        IF v_status NOT IN ('present', 'absent', 'excused') THEN
            v_status := 'absent';
        END IF;

        INSERT INTO public.attendance_entries (attendance_id, student_id, first_name, last_name, status)
        VALUES (v_att_id, v_student.id, v_student.first_name, v_student.last_name, v_status);
    END LOOP;

    DELETE FROM public.attendance_locks WHERE list_id = p_list_id AND token = p_token;

    RETURN json_build_object('success', true, 'ok', true, 'id', v_att_id);
END;
$$;

-- 5. create_list
CREATE OR REPLACE FUNCTION public.create_list(
    p_token TEXT,
    p_name TEXT,
    p_students JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
    v_list_id UUID;
    v_student JSONB;
BEGIN
    SELECT * INTO v_session FROM public.active_sessions WHERE token = p_token AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Oturum geçersiz.'; END IF;

    IF trim(COALESCE(p_name, '')) = '' THEN
        RAISE EXCEPTION 'Sınıf adı boş olamaz.';
    END IF;

    INSERT INTO public.class_lists (name, institution_id)
    VALUES (trim(p_name), v_session.institution_id)
    RETURNING id INTO v_list_id;

    FOR v_student IN SELECT * FROM jsonb_array_elements(p_students)
    LOOP
        INSERT INTO public.students (list_id, first_name, last_name, tc_no, institution_id)
        VALUES (
            v_list_id,
            trim(COALESCE(v_student->>'firstName', '')),
            trim(COALESCE(v_student->>'lastName', '')),
            NULLIF(trim(COALESCE(v_student->>'tcNo', '')), ''),
            v_session.institution_id
        );
    END LOOP;

    RETURN json_build_object(
        'success', true,
        'ok', true,
        'id', v_list_id,
        'listId', v_list_id,
        'name', trim(p_name)
    );
END;
$$;

-- 6. rename_list
CREATE OR REPLACE FUNCTION public.rename_list(
    p_token TEXT,
    p_list_id UUID,
    p_name TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
    v_clean_name TEXT := trim(COALESCE(p_name, ''));
BEGIN
    SELECT * INTO v_session FROM public.active_sessions WHERE token = p_token AND role = 'admin' AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Bu işlem için üst yetkili girişi gereklidir.'; END IF;

    IF v_clean_name = '' THEN RAISE EXCEPTION 'Sınıf adı boş olamaz.'; END IF;

    UPDATE public.class_lists SET name = v_clean_name WHERE id = p_list_id AND institution_id = v_session.institution_id;
    UPDATE public.attendance_records SET list_name = v_clean_name WHERE list_id = p_list_id AND institution_id = v_session.institution_id;

    RETURN json_build_object('success', true, 'ok', true, 'id', p_list_id, 'name', v_clean_name);
END;
$$;

-- 7. delete_list
CREATE OR REPLACE FUNCTION public.delete_list(p_token TEXT, p_list_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
BEGIN
    SELECT * INTO v_session FROM public.active_sessions WHERE token = p_token AND role = 'admin' AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Bu işlem için üst yetkili girişi gereklidir.'; END IF;

    DELETE FROM public.class_lists WHERE id = p_list_id AND institution_id = v_session.institution_id;
    RETURN json_build_object('success', true, 'ok', true);
END;
$$;

-- 8. regenerate_teacher_pin
CREATE OR REPLACE FUNCTION public.regenerate_teacher_pin(
    p_token TEXT,
    p_pin TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
    v_new_pin TEXT;
BEGIN
    SELECT * INTO v_session FROM public.active_sessions WHERE token = p_token AND role = 'admin' AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Bu işlem için üst yetkili girişi gereklidir.'; END IF;

    v_new_pin := COALESCE(NULLIF(trim(p_pin), ''), floor(100000 + random() * 900000)::text);

    UPDATE public.institutions
    SET teacher_pin = v_new_pin, pin_updated_at = now()
    WHERE id = v_session.institution_id;

    RETURN json_build_object(
        'ok', true,
        'teacherPin', v_new_pin,
        'pin', v_new_pin,
        'teacherPinDate', to_char(now(), 'DD.MM.YYYY HH24:MI')
    );
END;
$$;

-- 9. change_admin_password
CREATE OR REPLACE FUNCTION public.change_admin_password(
    p_token TEXT,
    p_old_password TEXT,
    p_new_password TEXT,
    p_confirm_password TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
    v_inst RECORD;
BEGIN
    SELECT * INTO v_session FROM public.active_sessions WHERE token = p_token AND role = 'admin' AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Bu işlem için üst yetkili girişi gereklidir.'; END IF;

    SELECT * INTO v_inst FROM public.institutions WHERE id = v_session.institution_id;

    IF p_old_password <> v_inst.admin_password THEN
        RAISE EXCEPTION 'Mevcut parola hatalı.';
    END IF;

    IF length(p_new_password) < 11 THEN
        RAISE EXCEPTION 'Yeni parola en az 11 karakter olmalıdır.';
    END IF;

    UPDATE public.institutions
    SET admin_password = p_new_password
    WHERE id = v_session.institution_id;

    RETURN json_build_object('success', true, 'ok', true);
END;
$$;

-- 10. admin_export_backup
CREATE OR REPLACE FUNCTION public.admin_export_backup(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
    v_lists JSON;
    v_history JSON;
BEGIN
    SELECT * INTO v_session FROM public.active_sessions WHERE token = p_token AND role = 'admin' AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Bu işlem için üst yetkili girişi gereklidir.'; END IF;

    SELECT COALESCE(json_agg(to_jsonb(c) || jsonb_build_object(
        'students', COALESCE((SELECT json_agg(to_jsonb(s)) FROM public.students s WHERE s.list_id = c.id AND s.institution_id = v_session.institution_id), '[]'::json)
    )), '[]'::json)
    INTO v_lists
    FROM public.class_lists c
    WHERE c.institution_id = v_session.institution_id;

    SELECT COALESCE(json_agg(to_jsonb(r) || jsonb_build_object(
        'entries', COALESCE((SELECT json_agg(to_jsonb(e)) FROM public.attendance_entries e WHERE e.attendance_id = r.id), '[]'::json)
    )), '[]'::json)
    INTO v_history
    FROM public.attendance_records r
    WHERE r.institution_id = v_session.institution_id;

    RETURN json_build_object(
        'ok', true,
        'version', '3.0.0-multi-tenant',
        'institutionSlug', v_session.institution_slug,
        'institutionName', v_session.institution_name,
        'exportedAt', now(),
        'lists', v_lists,
        'history', v_history
    );
END;
$$;

-- 11. Okul Havuzu RPC: get_school_students
CREATE OR REPLACE FUNCTION public.get_school_students(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
    v_pool JSONB;
BEGIN
    SELECT * INTO v_session FROM public.active_sessions WHERE token = p_token AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Oturum geçersiz.'; END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'firstName', first_name,
        'lastName', last_name,
        'tcNo', tc_no,
        'classLabel', class_label,
        'createdAt', created_at
    ) ORDER BY first_name, last_name), '[]'::jsonb)
    INTO v_pool
    FROM public.school_students
    WHERE institution_id = v_session.institution_id;

    RETURN v_pool;
END;
$$;

-- 12. Okul Havuzu RPC: upsert_school_students
CREATE OR REPLACE FUNCTION public.upsert_school_students(
    p_token TEXT,
    p_students JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
    v_student JSONB;
    v_first TEXT;
    v_last TEXT;
    v_tc TEXT;
    v_class TEXT;
    v_count INT := 0;
BEGIN
    SELECT * INTO v_session FROM public.active_sessions WHERE token = p_token AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Oturum geçersiz.'; END IF;

    FOR v_student IN SELECT * FROM jsonb_array_elements(p_students)
    LOOP
        v_first := trim(COALESCE(v_student->>'firstName', ''));
        v_last := trim(COALESCE(v_student->>'lastName', ''));
        v_tc := NULLIF(trim(COALESCE(v_student->>'tcNo', '')), '');
        v_class := NULLIF(trim(COALESCE(v_student->>'classLabel', '')), '');

        IF v_first <> '' AND v_last <> '' THEN
            INSERT INTO public.school_students (first_name, last_name, tc_no, class_label, institution_id)
            VALUES (v_first, v_last, v_tc, v_class, v_session.institution_id)
            ON CONFLICT DO NOTHING;
            v_count := v_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'insertedCount', v_count);
END;
$$;

-- 13. Okul Havuzu RPC: delete_school_student
CREATE OR REPLACE FUNCTION public.delete_school_student(
    p_token TEXT,
    p_student_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
BEGIN
    SELECT * INTO v_session FROM public.active_sessions WHERE token = p_token AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Oturum geçersiz.'; END IF;

    DELETE FROM public.school_students 
    WHERE id = p_student_id AND institution_id = v_session.institution_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. YENİ KURUM AÇMA KOLAYLIK FONKSİYONU (İsteğe Bağlı)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_institution(
    p_slug TEXT,
    p_name TEXT,
    p_teacher_pin TEXT DEFAULT '123456',
    p_admin_password TEXT DEFAULT 'Admin123456!'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_id UUID;
    v_clean_slug TEXT := lower(trim(p_slug));
BEGIN
    IF v_clean_slug = '' OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'Kurum kodu ve adı boş olamaz.';
    END IF;

    INSERT INTO public.institutions (slug, name, teacher_pin, admin_password)
    VALUES (v_clean_slug, trim(p_name), COALESCE(NULLIF(p_teacher_pin, ''), '123456'), COALESCE(NULLIF(p_admin_password, ''), 'Admin123456!'))
    RETURNING id INTO v_new_id;

    RETURN json_build_object('success', true, 'id', v_new_id, 'slug', v_clean_slug, 'name', trim(p_name));
END;
$$;

-- İzinler
GRANT ALL ON TABLE public.institutions TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_login(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_institution(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
