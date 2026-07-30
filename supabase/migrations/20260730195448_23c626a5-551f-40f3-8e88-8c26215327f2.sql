CREATE TABLE public.eva_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users,
  title TEXT NOT NULL DEFAULT 'New session',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eva_threads TO authenticated;
GRANT ALL ON public.eva_threads TO service_role;
ALTER TABLE public.eva_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own threads" ON public.eva_threads FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.eva_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.eva_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX eva_messages_thread_idx ON public.eva_messages (thread_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eva_messages TO authenticated;
GRANT ALL ON public.eva_messages TO service_role;
ALTER TABLE public.eva_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own messages" ON public.eva_messages FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.eva_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users,
  thread_id UUID REFERENCES public.eva_threads(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  path TEXT,
  ok BOOLEAN NOT NULL DEFAULT true,
  detail TEXT,
  source TEXT NOT NULL DEFAULT 'agent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX eva_audit_log_user_idx ON public.eva_audit_log (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eva_audit_log TO authenticated;
GRANT ALL ON public.eva_audit_log TO service_role;
ALTER TABLE public.eva_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own audit" ON public.eva_audit_log FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.eva_touch_thread() RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.eva_threads SET updated_at = now() WHERE id = NEW.thread_id;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE TRIGGER eva_messages_touch AFTER INSERT ON public.eva_messages FOR EACH ROW EXECUTE FUNCTION public.eva_touch_thread();