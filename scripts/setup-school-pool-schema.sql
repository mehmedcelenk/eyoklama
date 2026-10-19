-- ============================================================================
-- eYoklama v3: Okul Öğrenci Havuzu (Master Pool) Şeması ve RPC Fonksiyonları
-- Sınıflardan bağımsız kalıcı okul öğrenci havuzu yönetimi
-- ============================================================================

-- 1. Okul Havuzu Tablosu
CREATE TABLE IF NOT EXISTS public.school_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    tc_no VARCHAR(11),
    class_label TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_school_students_names ON public.school_students(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_school_students_tc ON public.school_students(tc_no);

-- RLS Güvenliği
ALTER TABLE public.school_students ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'school_students' AND policyname = 'Allow all access to school_students'
    ) THEN
        CREATE POLICY "Allow all access to school_students" ON public.school_students
            FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 2. Mevcut sınıflardaki öğrencileri havuza aktar (varsa tekrar ekleme yapmaz)
INSERT INTO public.school_students (first_name, last_name, tc_no, class_label)
SELECT DISTINCT s.first_name, s.last_name, s.tc_no, l.name
FROM public.students s
JOIN public.lists l ON l.id = s.list_id
WHERE NOT EXISTS (
    SELECT 1 FROM public.school_students ms
    WHERE ms.first_name = s.first_name AND ms.last_name = s.last_name
      AND (ms.tc_no = s.tc_no OR (ms.tc_no IS NULL AND s.tc_no IS NULL))
);

-- 3. RPC: Okul Öğrenci Havuzunu Getir
CREATE OR REPLACE FUNCTION public.get_school_students(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
    v_pool JSONB;
BEGIN
    SELECT * INTO v_session FROM public.app_sessions WHERE token_hash = p_token AND expires_at > now() AND revoked = false;
    IF NOT FOUND THEN
        SELECT * INTO v_session FROM public.weekly_teacher_devices WHERE token_hash = p_token;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Oturum geçersiz veya süresi dolmuş.';
        END IF;
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'firstName', first_name,
        'lastName', last_name,
        'tcNo', tc_no,
        'classLabel', class_label,
        'createdAt', created_at
    ) ORDER BY first_name, last_name), '[]'::jsonb)
    INTO v_pool
    FROM public.school_students;

    RETURN v_pool;
END;
$$;

-- 4. RPC: Havuz Öğrencilerini Toplu Ekle / Güncelle (Upsert)
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
    SELECT * INTO v_session FROM public.app_sessions WHERE token_hash = p_token AND expires_at > now() AND revoked = false;
    IF NOT FOUND THEN
        SELECT * INTO v_session FROM public.weekly_teacher_devices WHERE token_hash = p_token;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Oturum geçersiz veya süresi dolmuş.';
        END IF;
    END IF;

    FOR v_student IN SELECT * FROM jsonb_array_elements(p_students)
    LOOP
        v_first := trim(COALESCE(v_student->>'firstName', ''));
        v_last := trim(COALESCE(v_student->>'lastName', ''));
        v_tc := NULLIF(trim(COALESCE(v_student->>'tcNo', '')), '');
        v_class := NULLIF(trim(COALESCE(v_student->>'classLabel', '')), '');

        IF v_first <> '' AND v_last <> '' THEN
            -- Varsa şube veya TC güncelle, yoksa ekle
            INSERT INTO public.school_students (first_name, last_name, tc_no, class_label)
            VALUES (v_first, v_last, v_tc, v_class)
            ON CONFLICT DO NOTHING;
            v_count := v_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'insertedCount', v_count);
END;
$$;

-- 5. RPC: Havuzdan Tekil Öğrenci Sil
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
    SELECT * INTO v_session FROM public.app_sessions WHERE token_hash = p_token AND expires_at > now() AND revoked = false;
    IF NOT FOUND THEN
        SELECT * INTO v_session FROM public.weekly_teacher_devices WHERE token_hash = p_token;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Oturum geçersiz veya süresi dolmuş.';
        END IF;
    END IF;

    DELETE FROM public.school_students WHERE id = p_student_id;
    RETURN jsonb_build_object('success', true);
END;
$$;
