-- ============================================================================
-- eYoklama v3: Sınıf & Havuz Çift Yönlü Öğrenci Senkronizasyonu
-- Canlı Supabase şeması (public.lists, public.students, public.school_students) ile birebir uyumlu
-- ============================================================================

-- 1. Sınıftaki Öğrenciyi Güncelle ve Havuzla Eşitle
CREATE OR REPLACE FUNCTION public.update_student_in_list(
    p_token TEXT,
    p_list_id UUID,
    p_student_id UUID,
    p_first_name TEXT,
    p_last_name TEXT,
    p_tc_no TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_clean_first TEXT := trim(COALESCE(p_first_name, ''));
    v_clean_last  TEXT := trim(COALESCE(p_last_name, ''));
    v_clean_tc    TEXT := NULLIF(trim(COALESCE(p_tc_no, '')), '');
    v_old_first   TEXT;
    v_old_last    TEXT;
    v_old_tc      TEXT;
    v_list_name   TEXT;
BEGIN
    IF v_clean_first = '' OR v_clean_last = '' THEN
        RAISE EXCEPTION 'İsim ve soyisim boş olamaz.';
    END IF;

    SELECT first_name, last_name, tc_no INTO v_old_first, v_old_last, v_old_tc
    FROM public.students WHERE id = p_student_id;

    SELECT name INTO v_list_name FROM public.lists WHERE id = p_list_id;

    -- Sınıftaki kaydı güncelle
    UPDATE public.students
    SET first_name = v_clean_first, last_name = v_clean_last, tc_no = v_clean_tc
    WHERE id = p_student_id;

    -- Okul havuzunda (school_students) varsa güncelle, yoksa ekle
    UPDATE public.school_students
    SET first_name = v_clean_first,
        last_name = v_clean_last,
        tc_no = v_clean_tc,
        class_label = COALESCE(v_list_name, class_label)
    WHERE (v_clean_tc IS NOT NULL AND tc_no = v_clean_tc)
       OR (v_old_tc IS NOT NULL AND tc_no = v_old_tc)
       OR (lower(first_name) = lower(v_old_first) AND lower(last_name) = lower(v_old_last));

    IF NOT FOUND THEN
        INSERT INTO public.school_students (first_name, last_name, tc_no, class_label)
        VALUES (v_clean_first, v_clean_last, v_clean_tc, v_list_name);
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 2. Havuzdaki Öğrenciyi Güncelle ve Sınıflarla Eşitle
CREATE OR REPLACE FUNCTION public.update_school_student(
    p_token TEXT,
    p_student_id UUID,
    p_first_name TEXT,
    p_last_name TEXT,
    p_tc_no TEXT DEFAULT NULL,
    p_class_label TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_clean_first TEXT := trim(COALESCE(p_first_name, ''));
    v_clean_last  TEXT := trim(COALESCE(p_last_name, ''));
    v_clean_tc    TEXT := NULLIF(trim(COALESCE(p_tc_no, '')), '');
    v_clean_class TEXT := NULLIF(trim(COALESCE(p_class_label, '')), '');
    v_old_first   TEXT;
    v_old_last    TEXT;
    v_old_tc      TEXT;
BEGIN
    IF v_clean_first = '' OR v_clean_last = '' THEN
        RAISE EXCEPTION 'İsim ve soyisim boş olamaz.';
    END IF;

    SELECT first_name, last_name, tc_no INTO v_old_first, v_old_last, v_old_tc
    FROM public.school_students WHERE id = p_student_id;

    -- Havuz kaydını güncelle
    UPDATE public.school_students
    SET first_name = v_clean_first,
        last_name = v_clean_last,
        tc_no = v_clean_tc,
        class_label = v_clean_class
    WHERE id = p_student_id;

    -- Kayıtlı olduğu sınıflardaki (students) kaydını güncelle
    UPDATE public.students
    SET first_name = v_clean_first,
        last_name = v_clean_last,
        tc_no = COALESCE(v_clean_tc, tc_no)
    WHERE (v_clean_tc IS NOT NULL AND tc_no = v_clean_tc)
       OR (v_old_tc IS NOT NULL AND tc_no = v_old_tc)
       OR (lower(first_name) = lower(v_old_first) AND lower(last_name) = lower(v_old_last));

    RETURN jsonb_build_object('success', true);
END;
$$;

-- İzinler ve Şema Yenileme
GRANT EXECUTE ON FUNCTION public.update_student_in_list(TEXT, UUID, UUID, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_school_student(TEXT, UUID, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
