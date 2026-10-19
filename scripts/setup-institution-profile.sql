-- ============================================================================
-- eYoklama v3: Kurum Bilgilerini Güncelleme (Ad ve Kod/Slug) RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_institution_profile(
    p_token TEXT,
    p_name TEXT,
    p_slug TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
    v_clean_name TEXT := trim(COALESCE(p_name, ''));
    v_clean_slug TEXT := lower(trim(COALESCE(p_slug, '')));
BEGIN
    -- 1. Yönetici oturumu doğrula
    SELECT * INTO v_session 
    FROM public.active_sessions 
    WHERE token = p_token AND role = 'admin' AND expires_at > now();
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bu işlem için üst yetkili girişi gereklidir.';
    END IF;

    -- 2. Girdi kontrolleri
    IF length(v_clean_name) < 2 THEN
        RAISE EXCEPTION 'Kurum adı en az 2 karakter olmalıdır.';
    END IF;

    IF length(v_clean_slug) < 2 THEN
        RAISE EXCEPTION 'Kurum kodu en az 2 karakter olmalıdır.';
    END IF;

    IF v_clean_slug !~ '^[a-z0-9_-]+$' THEN
        RAISE EXCEPTION 'Kurum kodu yalnızca küçük harf, rakam, alt çizgi ve tire içerebilir.';
    END IF;

    -- 3. Slug benzersizlik kontrolü (başka kurum kullanıyor mu?)
    IF EXISTS (
        SELECT 1 FROM public.institutions 
        WHERE lower(slug) = v_clean_slug AND id <> v_session.institution_id
    ) THEN
        RAISE EXCEPTION 'Bu kurum kodu zaten başka bir kurum tarafından kullanılıyor.';
    END IF;

    -- 4. Kurumu güncelle
    UPDATE public.institutions
    SET name = v_clean_name,
        slug = v_clean_slug
    WHERE id = v_session.institution_id;

    RETURN jsonb_build_object(
        'success', true,
        'name', v_clean_name,
        'slug', v_clean_slug
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_institution_profile(TEXT, TEXT, TEXT) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
