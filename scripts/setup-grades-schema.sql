-- ============================================================================
-- eYoklama: Not & Kanaat Sistemi - Kesin ve Orijinal Oturum Uyumlu SQL
-- Gerçek Tablolar: lists, students, app_sessions, private.get_session
-- ============================================================================

-- 1. Öğrenci Tablosuna tc_no Alanı ve İndeks
ALTER TABLE IF EXISTS public.students 
ADD COLUMN IF NOT EXISTS tc_no VARCHAR(11);

CREATE INDEX IF NOT EXISTS idx_students_tc ON public.students(tc_no);

-- 2. Notlar ve Kanaatler Tablosu
CREATE TABLE IF NOT EXISTS public.student_grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_tc VARCHAR(11) NOT NULL,
    list_id UUID NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_student_grades_class_slot 
ON public.student_grades(list_id, course_name, academic_year, term, exam);

-- 3. Veli Şifresiz Karne Sorgulama RPC
CREATE OR REPLACE FUNCTION public.get_student_report(p_tc TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'extensions', 'pg_temp'
AS $$
DECLARE
    v_clean_tc TEXT;
    v_student RECORD;
    v_grades JSON;
BEGIN
    v_clean_tc := regexp_replace(p_tc, '\D', '', 'g');

    IF length(v_clean_tc) <> 11 THEN
        RETURN json_build_object('success', false, 'error', 'Geçersiz T.C. Kimlik Numarası (11 hane olmalıdır)');
    END IF;

    -- Öğrenci sorgusu
    SELECT s.first_name, s.last_name, COALESCE(l.name, 'Belirtilmemiş') as class_name
    INTO v_student
    FROM public.students s
    LEFT JOIN public.lists l ON l.id = s.list_id
    WHERE s.tc_no = v_clean_tc
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Bu T.C. numarasına ait öğrenci kaydı bulunamadı.');
    END IF;

    -- Not ve kanaatlerin çekilmesi
    SELECT json_agg(json_build_object(
        'academicYear', academic_year,
        'term', term,
        'exam', exam,
        'courseName', course_name,
        'grade', grade,
        'opinion', opinion,
        'updatedAt', updated_at
    ) ORDER BY academic_year DESC, term ASC, course_name ASC, exam ASC)
    INTO v_grades
    FROM public.student_grades
    WHERE student_tc = v_clean_tc;

    RETURN json_build_object(
        'success', true,
        'student', json_build_object(
            'firstName', v_student.first_name,
            'lastName', v_student.last_name,
            'className', v_student.class_name
        ),
        'grades', COALESCE(v_grades, '[]'::json)
    );
END;
$$;

-- 4. Hoca Toplu Not & Kanaat Kaydetme RPC (private.get_session ile tam uyumlu)
CREATE OR REPLACE FUNCTION public.save_grades_batch(
    p_token TEXT,
    p_list_id UUID,
    p_course_name TEXT,
    p_academic_year TEXT,
    p_term SMALLINT,
    p_exam SMALLINT,
    p_entries JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'extensions', 'pg_temp'
AS $$
DECLARE
    v_session RECORD;
    v_item JSONB;
    v_course TEXT;
    v_year TEXT;
BEGIN
    -- Orijinal eYoklama oturum kontrolü
    SELECT * INTO v_session FROM private.get_session(p_token) LIMIT 1;

    v_course := COALESCE(NULLIF(trim(p_course_name), ''), 'Genel');
    v_year := COALESCE(NULLIF(trim(p_academic_year), ''), '2024-2025');

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_entries)
    LOOP
        INSERT INTO public.student_grades (
            student_tc, list_id, course_name, academic_year, term, exam, grade, opinion, updated_at
        )
        VALUES (
            v_item->>'tc',
            p_list_id,
            v_course,
            v_year,
            p_term,
            p_exam,
            COALESCE(v_item->>'grade', ''),
            COALESCE(v_item->>'opinion', ''),
            now()
        )
        ON CONFLICT (student_tc, list_id, course_name, academic_year, term, exam)
        DO UPDATE SET
            grade = EXCLUDED.grade,
            opinion = EXCLUDED.opinion,
            updated_at = now();
    END LOOP;

    RETURN json_build_object('success', true);
END;
$$;

-- 5. Belirli Sınıf/Ders Notlarını Getirme RPC (private.get_session ile tam uyumlu)
CREATE OR REPLACE FUNCTION public.get_class_grades(
    p_token TEXT,
    p_list_id UUID,
    p_course_name TEXT,
    p_academic_year TEXT,
    p_term SMALLINT,
    p_exam SMALLINT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'extensions', 'pg_temp'
AS $$
DECLARE
    v_session RECORD;
    v_grades JSON;
    v_course TEXT;
    v_year TEXT;
BEGIN
    -- Orijinal eYoklama oturum kontrolü
    SELECT * INTO v_session FROM private.get_session(p_token) LIMIT 1;

    v_course := COALESCE(NULLIF(trim(p_course_name), ''), 'Genel');
    v_year := COALESCE(NULLIF(trim(p_academic_year), ''), '2024-2025');

    SELECT json_object_agg(
        student_tc,
        json_build_object('grade', grade, 'opinion', opinion)
    )
    INTO v_grades
    FROM public.student_grades
    WHERE list_id = p_list_id 
      AND course_name = v_course
      AND academic_year = v_year 
      AND term = p_term 
      AND exam = p_exam;

    RETURN COALESCE(v_grades, '{}'::json);
END;
$$;

-- 6. bootstrap_impl Güncellemesi: Sınıf öğrencileri yüklenirken tc_no da gelsin
CREATE OR REPLACE FUNCTION private.bootstrap_impl(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions', 'pg_temp'
AS $function$
declare
  s record;
  lists_json jsonb;
  history_json jsonb;
  pin text := null;
begin
  select * into s from private.get_session(p_token) limit 1;
  if s.role='admin' then pin := private.ensure_daily_teacher_pin(); end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',l.id,'name',l.name,'createdByName',l.created_by_name,'createdAt',l.created_at,
      'students',coalesce((select jsonb_agg(jsonb_build_object(
          'id',st.id,'firstName',st.first_name,'lastName',st.last_name,'sortOrder',st.sort_order,'tcNo',st.tc_no
        ) order by st.sort_order) from public.students st where st.list_id=l.id),'[]'::jsonb)
    ) order by l.created_at
  ),'[]'::jsonb) into lists_json
  from public.lists l;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',a.id,'listId',a.list_id,'listName',a.list_name_snapshot,'takenByName',a.taken_by_name,
      'takenAt',a.taken_at,'locked',a.locked,'unlockedAt',a.unlocked_at,'unlockedByName',a.unlocked_by_name,
      'updatedAt',a.updated_at,'updatedByName',a.updated_by_name,
      'archivedAt',a.archived_at,'archivedByName',a.archived_by_name,
      'counts',jsonb_build_object(
        'present',(select count(*) from public.attendance_entries e where e.attendance_id=a.id and e.status='present'),
        'absent',(select count(*) from public.attendance_entries e where e.attendance_id=a.id and e.status='absent'),
        'excused',(select count(*) from public.attendance_entries e where e.attendance_id=a.id and e.status='excused')
      )
    ) order by a.taken_at desc
  ),'[]'::jsonb) into history_json
  from (select * from public.attendance_sessions order by taken_at desc limit 400) a;

  return jsonb_build_object('ok',true,'role',s.role,'displayName',s.display_name,'expiresAt',s.expires_at,
    'teacherPin',pin,'teacherPinDate',case when pin is null then null else (now() at time zone 'Europe/Istanbul')::date end,
    'lists',lists_json,'history',history_json);
end
$function$;

-- İzinleri tanımla
GRANT EXECUTE ON FUNCTION public.get_student_report(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_grades_batch(TEXT, UUID, TEXT, TEXT, SMALLINT, SMALLINT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_class_grades(TEXT, UUID, TEXT, TEXT, SMALLINT, SMALLINT) TO anon, authenticated;
