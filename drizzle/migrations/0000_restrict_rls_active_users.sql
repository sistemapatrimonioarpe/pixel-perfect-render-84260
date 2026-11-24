CREATE OR REPLACE FUNCTION public.usuario_ativo(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.perfis WHERE id = _user_id AND ativo)
$$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['equipamentos','inventarios','setores','inventario_itens','historico'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth all" ON public.%I', t);
    EXECUTE format('CREATE POLICY "ativos acesso" ON public.%I FOR ALL TO authenticated USING (public.usuario_ativo(auth.uid())) WITH CHECK (public.usuario_ativo(auth.uid()))', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "perfis leitura" ON public.perfis;
CREATE POLICY "perfis leitura" ON public.perfis FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "roles leitura" ON public.user_roles;
CREATE POLICY "roles leitura" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));