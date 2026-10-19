-- ============================================================================
-- eYoklama v3: Tam Veritabanı Şeması ve 17 RPC Fonksiyonu (PostgreSQL / Supabase)
-- Yeni bir kurum için Supabase SQL Editor'da tek seferde çalıştırılabilir.
-- ============================================================================

-- Gerekli eklentiler
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. TABLOLAR
-- ----------------------------------------------------------------------------

-- Sınıf Listeleri
CREATE TABLE IF NOT EXISTS public.class_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Öğrenciler
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES public.class_lists(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    tc_no VARCHAR(11),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_students_list_id ON public.students(list_id);
CREATE INDEX IF NOT EXISTS idx_students_tc ON public.students(tc_no);

-- Yoklama Oturumları (History Records)
CREATE TABLE IF NOT EXISTS public.attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES public.class_lists(id) ON DELETE CASCADE,
    list_name TEXT NOT NULL,
    taken_at TIMESTAMPTZ DEFAULT now(),
    taken_by_name TEXT NOT NULL,
    archived_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_list_id ON public.attendance_records(list_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_taken_at ON public.attendance_records(taken_at DESC);

-- Yoklama Satırları (Entries)
CREATE TABLE IF NOT EXISTS public.attendance_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_id UUID NOT NULL REFERENCES public.attendance_records(id) ON DELETE CASCADE,
    student_id UUID NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'excused')),
    note TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_entries_att_id ON public.attendance_entries(attendance_id);

-- Eşzamanlı Yoklama Kilitleri (Concurrency Locks - 45s heartbeat)
CREATE TABLE IF NOT EXISTS public.attendance_locks (
    list_id UUID PRIMARY KEY REFERENCES public.class_lists(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    locked_by TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);

-- Aktif Oturumlar (Token bazlı)
CREATE TABLE IF NOT EXISTS public.active_sessions (
    token TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('teacher', 'admin')),
    display_name TEXT NOT NULL,
    device_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_device ON public.active_sessions(device_token);

-- Sistem Ayarları (Hoca PIN'i ve Admin Parolası)
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Geri Alma Belirteçleri (Undo Tokens)
CREATE TABLE IF NOT EXISTS public.attendance_undos (
    undo_token TEXT PRIMARY KEY,
    attendance_id UUID NOT NULL REFERENCES public.attendance_records(id) ON DELETE CASCADE,
    snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Tarihsel Notlar ve Kanaatler Tablosu (Opsiyonel Karne/Not Modülü)
CREATE TABLE IF NOT EXISTS public.student_grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_tc VARCHAR(11) NOT NULL,
    list_id UUID NOT NULL REFERENCES public.class_lists(id) ON DELETE CASCADE,
    course_name TEXT NOT NULL DEFAULT 'Genel',
    academic_year VARCHAR(10) NOT NULL DEFAULT '2024-2025',
    term SMALLINT NOT NULL CHECK (term BETWEEN 1 AND 4),
    exam SMALLINT NOT NULL CHECK (exam BETWEEN 1 AND 4),
    grade VARCHAR(10) NOT NULL DEFAULT '',
    opinion TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_student_grade_slot UNIQUE (student_tc, list_id, course_name, academic_year, term, exam)
);

CREATE INDEX IF NOT EXISTS idx_student_grades_tc ON public.student_grades(student_tc);

-- ----------------------------------------------------------------------------
-- 2. BAŞLANGIÇ VERİLERİ (Default Admin & PIN)
-- ----------------------------------------------------------------------------

INSERT INTO public.system_settings (key, value, updated_at)
VALUES 
    ('teacher_pin', '123456', now()),
    ('admin_password', 'Admin123456!', now())
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. 17 ADET ÇEKİRDEK RPC STORED PROCEDURE
-- ----------------------------------------------------------------------------

-- 1. app_login
CREATE OR REPLACE FUNCTION public.app_login(
    p_name TEXT DEFAULT '',
    p_pin TEXT DEFAULT '',
    p_device_token TEXT DEFAULT ''
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_name TEXT := trim(COALESCE(p_name, ''));
    v_clean_pin TEXT := trim(COALESCE(p_pin, ''));
    v_admin_pwd TEXT;
    v_teacher_pin TEXT;
    v_new_token TEXT;
    v_expires TIMESTAMPTZ;
    v_existing_session RECORD;
BEGIN
    SELECT value INTO v_admin_pwd FROM public.system_settings WHERE key = 'admin_password';
    SELECT value INTO v_teacher_pin FROM public.system_settings WHERE key = 'teacher_pin';

    -- Admin Girişi (Pin admin şifresiyle eşleşirse veya ad 'admin' ise)
    IF v_clean_pin = v_admin_pwd OR (lower(v_clean_name) = 'admin' AND v_clean_pin = v_admin_pwd) THEN
        v_new_token := encode(gen_random_bytes(32), 'hex');
        v_expires := now() + INTERVAL '24 hours';

        INSERT INTO public.active_sessions (token, role, display_name, device_token, expires_at)
        VALUES (v_new_token, 'admin', 'Üst Yönetici', COALESCE(p_device_token, ''), v_expires);

        RETURN json_build_object(
            'ok', true,
            'role', 'admin',
            'displayName', 'Üst Yönetici',
            'token', v_new_token,
            'expiresAt', v_expires
        );
    END IF;

    -- Hoca Hatırlanan Oturumla Devam Etme (Ad ve PIN boş geldiğinde cihaz token kontrolü)
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

    -- Standart Hoca Girişi
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
    v_teacher_pin TEXT;
    v_pin_updated TEXT;
    v_lists JSON;
    v_history JSON;
BEGIN
    SELECT * INTO v_session FROM public.active_sessions WHERE token = p_token AND expires_at > now();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Oturum geçersiz veya süresi dolmuş.';
    END IF;

    SELECT value, to_char(updated_at, 'DD.MM.YYYY HH24:MI') INTO v_teacher_pin, v_pin_updated
    FROM public.system_settings WHERE key = 'teacher_pin';

    -- Sınıf listeleri ve öğrencileri
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
            WHERE s.list_id = c.id
        ), '[]'::json)
    ) ORDER BY c.name), '[]'::json)
    INTO v_lists
    FROM public.class_lists c;

    -- Geçmiş yoklamalar
    SELECT COALESCE(json_agg(json_build_object(
        'id', r.id,
        'listId', r.list_id,
        'listName', r.list_name,
        'takenAt', r.taken_at,
        'takenByName', r.taken_by_name,
        'archivedAt', r.archived_at
    ) ORDER BY r.taken_at DESC), '[]'::json)
    INTO v_history
    FROM public.attendance_records r;

    RETURN json_build_object(
        'role', v_session.role,
        'displayName', v_session.display_name,
        'lists', v_lists,
        'history', v_history,
        'teacherPin', CASE WHEN v_session.role = 'admin' THEN v_teacher_pin ELSE NULL END,
        'teacherPinDate', CASE WHEN v_session.role = 'admin' THEN v_pin_updated ELSE NULL END
    );
END;
$$;

-- 3. app_logout
CREATE OR REPLACE FUNCTION public.app_logout(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.active_sessions WHERE token = p_token;
    DELETE FROM public.attendance_locks WHERE token = p_token;
    RETURN json_build_object('ok', true);
END;
$$;

-- 4. begin_attendance
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

    -- Süresi geçmiş kilitleri temizle
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

    INSERT INTO public.attendance_locks (list_id, token, locked_by, expires_at)
    VALUES (p_list_id, p_token, v_session.display_name, now() + INTERVAL '45 seconds')
    ON CONFLICT (list_id) DO UPDATE SET
        token = EXCLUDED.token,
        locked_by = EXCLUDED.locked_by,
        expires_at = EXCLUDED.expires_at;

    RETURN json_build_object('ok', true, 'acquired', true);
END;
$$;

-- 5. release_attendance
CREATE OR REPLACE FUNCTION public.release_attendance(p_token TEXT, p_list_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.attendance_locks WHERE list_id = p_list_id AND token = p_token;
    RETURN json_build_object('ok', true);
END;
$$;

-- 6. heartbeat_attendance
CREATE OR REPLACE FUNCTION public.heartbeat_attendance(p_token TEXT, p_list_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.attendance_locks
    SET expires_at = now() + INTERVAL '45 seconds'
    WHERE list_id = p_list_id AND token = p_token;
    RETURN json_build_object('ok', true);
END;
$$;

-- 7. save_attendance
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

    SELECT * INTO v_list FROM public.class_lists WHERE id = p_list_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sınıf bulunamadı.'; END IF;

    -- Yoklama başlık kaydı
    INSERT INTO public.attendance_records (list_id, list_name, taken_at, taken_by_name)
    VALUES (p_list_id, v_list.name, now(), v_session.display_name)
    RETURNING id INTO v_att_id;

    -- Öğrenci durumları
    FOR v_student IN SELECT * FROM public.students WHERE list_id = p_list_id
    LOOP
        v_status := COALESCE(p_statuses->>v_student.id::text, 'absent');
        IF v_status NOT IN ('present', 'absent', 'excused') THEN
            v_status := 'absent';
        END IF;

        INSERT INTO public.attendance_entries (attendance_id, student_id, first_name, last_name, status)
        VALUES (v_att_id, v_student.id, v_student.first_name, v_student.last_name, v_status);
    END LOOP;

    -- Kilidi kaldır
    DELETE FROM public.attendance_locks WHERE list_id = p_list_id AND token = p_token;

    RETURN json_build_object('success', true, 'ok', true, 'id', v_att_id);
END;
$$;

-- 8. get_attendance
CREATE OR REPLACE FUNCTION public.get_attendance(p_token TEXT, p_attendance_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_record RECORD;
    v_entries JSON;
BEGIN
    PERFORM 1 FROM public.active_sessions WHERE token = p_token AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Oturum geçersiz.'; END IF;

    SELECT * INTO v_record FROM public.attendance_records WHERE id = p_attendance_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Yoklama kaydı bulunamadı.'; END IF;

    SELECT COALESCE(json_agg(json_build_object(
        'studentId', e.student_id,
        'firstName', e.first_name,
        'lastName', e.last_name,
        'status', e.status,
        'note', e.note
    ) ORDER BY e.first_name, e.last_name), '[]'::json)
    INTO v_entries
    FROM public.attendance_entries e
    WHERE e.attendance_id = p_attendance_id;

    RETURN json_build_object(
        'attendance', json_build_object(
            'id', v_record.id,
            'listId', v_record.list_id,
            'listName', v_record.list_name,
            'takenAt', v_record.taken_at,
            'takenByName', v_record.taken_by_name,
            'archivedAt', v_record.archived_at
        ),
        'entries', v_entries
    );
END;
$$;

-- 9. apply_attendance_changes
CREATE OR REPLACE FUNCTION public.apply_attendance_changes(
    p_token TEXT,
    p_attendance_id UUID,
    p_changes JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
    v_undo_token TEXT;
    v_snapshot JSONB;
    v_change RECORD;
BEGIN
    SELECT * INTO v_session FROM public.active_sessions WHERE token = p_token AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Oturum geçersiz.'; END IF;

    -- Mevcut durumun anlık görüntüsü (Snapshot)
    SELECT jsonb_agg(to_jsonb(e)) INTO v_snapshot
    FROM public.attendance_entries e
    WHERE e.attendance_id = p_attendance_id;

    v_undo_token := encode(gen_random_bytes(16), 'hex');

    INSERT INTO public.attendance_undos (undo_token, attendance_id, snapshot)
    VALUES (v_undo_token, p_attendance_id, v_snapshot);

    -- Değişiklikleri uygula (JSON array: [{studentId, status, note}])
    FOR v_change IN SELECT * FROM jsonb_to_recordset(p_changes) AS x(studentId UUID, status TEXT, note TEXT)
    LOOP
        UPDATE public.attendance_entries
        SET status = v_change.status,
            note = COALESCE(v_change.note, note)
        WHERE attendance_id = p_attendance_id AND student_id = v_change.studentId;
    END LOOP;

    RETURN json_build_object('success', true, 'ok', true, 'undoToken', v_undo_token);
END;
$$;

-- 10. undo_attendance_change
CREATE OR REPLACE FUNCTION public.undo_attendance_change(
    p_token TEXT,
    p_attendance_id UUID,
    p_undo_token TEXT,
    p_password TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
    v_admin_pwd TEXT;
    v_undo RECORD;
    v_item JSONB;
BEGIN
    SELECT * INTO v_session FROM public.active_sessions WHERE token = p_token AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Oturum geçersiz.'; END IF;

    -- Eğer şifre verilmişse admin şifresi kontrol edilir
    IF p_password IS NOT NULL AND p_password <> '' THEN
        SELECT value INTO v_admin_pwd FROM public.system_settings WHERE key = 'admin_password';
        IF p_password <> v_admin_pwd THEN
            RAISE EXCEPTION 'Hatalı yönetici parolası.';
        END IF;
    END IF;

    SELECT * INTO v_undo FROM public.attendance_undos WHERE undo_token = p_undo_token;
    IF NOT FOUND THEN RAISE EXCEPTION 'Geri alma belirteci bulunamadı veya süresi dolmuş.'; END IF;

    -- Snapshot'tan eski durumları geri yükle
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_undo.snapshot)
    LOOP
        UPDATE public.attendance_entries
        SET status = v_item->>'status',
            note = v_item->>'note'
        WHERE id = (v_item->>'id')::UUID;
    END LOOP;

    DELETE FROM public.attendance_undos WHERE undo_token = p_undo_token;

    RETURN json_build_object('success', true, 'ok', true);
END;
$$;

-- 11. archive_attendance
CREATE OR REPLACE FUNCTION public.archive_attendance(p_token TEXT, p_attendance_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM 1 FROM public.active_sessions WHERE token = p_token AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Oturum geçersiz.'; END IF;

    UPDATE public.attendance_records
    SET archived_at = CASE WHEN archived_at IS NULL THEN now() ELSE NULL END
    WHERE id = p_attendance_id;

    RETURN json_build_object('success', true, 'ok', true);
END;
$$;

-- 12. create_list
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

    INSERT INTO public.class_lists (name)
    VALUES (trim(p_name))
    RETURNING id INTO v_list_id;

    FOR v_student IN SELECT * FROM jsonb_array_elements(p_students)
    LOOP
        INSERT INTO public.students (list_id, first_name, last_name, tc_no)
        VALUES (
            v_list_id,
            trim(COALESCE(v_student->>'firstName', '')),
            trim(COALESCE(v_student->>'lastName', '')),
            NULLIF(trim(COALESCE(v_student->>'tcNo', '')), '')
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

-- 13. rename_list
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
    v_clean_name TEXT := trim(COALESCE(p_name, ''));
BEGIN
    PERFORM 1 FROM public.active_sessions WHERE token = p_token AND role = 'admin' AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Bu işlem için üst yetkili girişi gereklidir.'; END IF;

    IF v_clean_name = '' THEN RAISE EXCEPTION 'Sınıf adı boş olamaz.'; END IF;

    UPDATE public.class_lists SET name = v_clean_name WHERE id = p_list_id;
    UPDATE public.attendance_records SET list_name = v_clean_name WHERE list_id = p_list_id;

    RETURN json_build_object('success', true, 'ok', true, 'id', p_list_id, 'name', v_clean_name);
END;
$$;

-- 14. delete_list
CREATE OR REPLACE FUNCTION public.delete_list(p_token TEXT, p_list_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM 1 FROM public.active_sessions WHERE token = p_token AND role = 'admin' AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Bu işlem için üst yetkili girişi gereklidir.'; END IF;

    DELETE FROM public.class_lists WHERE id = p_list_id;
    RETURN json_build_object('success', true, 'ok', true);
END;
$$;

-- 15. regenerate_teacher_pin
CREATE OR REPLACE FUNCTION public.regenerate_teacher_pin(
    p_token TEXT,
    p_pin TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_pin TEXT;
BEGIN
    PERFORM 1 FROM public.active_sessions WHERE token = p_token AND role = 'admin' AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Bu işlem için üst yetkili girişi gereklidir.'; END IF;

    v_new_pin := COALESCE(NULLIF(trim(p_pin), ''), floor(100000 + random() * 900000)::text);

    UPDATE public.system_settings
    SET value = v_new_pin, updated_at = now()
    WHERE key = 'teacher_pin';

    RETURN json_build_object(
        'ok', true,
        'teacherPin', v_new_pin,
        'pin', v_new_pin,
        'teacherPinDate', to_char(now(), 'DD.MM.YYYY HH24:MI')
    );
END;
$$;

-- 16. change_admin_password
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
    v_current_pwd TEXT;
BEGIN
    PERFORM 1 FROM public.active_sessions WHERE token = p_token AND role = 'admin' AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Bu işlem için üst yetkili girişi gereklidir.'; END IF;

    SELECT value INTO v_current_pwd FROM public.system_settings WHERE key = 'admin_password';

    IF p_old_password <> v_current_pwd THEN
        RAISE EXCEPTION 'Mevcut parola hatalı.';
    END IF;

    IF length(p_new_password) < 11 THEN
        RAISE EXCEPTION 'Yeni parola en az 11 karakter olmalıdır.';
    END IF;

    UPDATE public.system_settings
    SET value = p_new_password, updated_at = now()
    WHERE key = 'admin_password';

    RETURN json_build_object('success', true, 'ok', true);
END;
$$;

-- 17. admin_export_backup
CREATE OR REPLACE FUNCTION public.admin_export_backup(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_lists JSON;
    v_history JSON;
BEGIN
    PERFORM 1 FROM public.active_sessions WHERE token = p_token AND role = 'admin' AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Bu işlem için üst yetkili girişi gereklidir.'; END IF;

    SELECT COALESCE(json_agg(to_jsonb(c) || jsonb_build_object(
        'students', COALESCE((SELECT json_agg(to_jsonb(s)) FROM public.students s WHERE s.list_id = c.id), '[]'::json)
    )), '[]'::json)
    INTO v_lists
    FROM public.class_lists c;

    SELECT COALESCE(json_agg(to_jsonb(r) || jsonb_build_object(
        'entries', COALESCE((SELECT json_agg(to_jsonb(e)) FROM public.attendance_entries e WHERE e.attendance_id = r.id), '[]'::json)
    )), '[]'::json)
    INTO v_history
    FROM public.attendance_records r;

    RETURN json_build_object(
        'ok', true,
        'version', '3.0.0',
        'exportedAt', now(),
        'lists', v_lists,
        'history', v_history
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. ANONİM & OTURUM AÇMIŞ KULLANICI İZİNLERİ
-- ----------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.app_login(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_bootstrap(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_logout(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_attendance(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_attendance(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_attendance(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_attendance(TEXT, UUID, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_attendance(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_attendance_changes(TEXT, UUID, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.undo_attendance_change(TEXT, UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_attendance(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_list(TEXT, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rename_list(TEXT, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_list(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_teacher_pin(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_admin_password(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_export_backup(TEXT) TO anon, authenticated;
