-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  username text,
  avatar_url text,
  parent_email text,
  parent_name text,
  parent_phone text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Create attendance_settings table
CREATE TABLE IF NOT EXISTS public.attendance_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create attendance_records table
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  timestamp timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL,
  device_info jsonb,
  image_url text,
  face_descriptor text,
  confidence_score numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create ai_insights table
CREATE TABLE IF NOT EXISTS public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_type text NOT NULL,
  content text NOT NULL,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_attendance_records_user_id ON public.attendance_records(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_timestamp ON public.attendance_records(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_records_status ON public.attendance_records(status);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

-- Create has_role function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Profiles policies
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- User roles policies
CREATE POLICY "Users can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Attendance settings policies (admin only)
CREATE POLICY "Anyone can view attendance settings"
  ON public.attendance_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Public can view attendance settings"
  ON public.attendance_settings FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Admins can manage attendance settings"
  ON public.attendance_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Attendance records policies
CREATE POLICY "Allow public to read attendance records"
  ON public.attendance_records FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public to insert attendance records"
  ON public.attendance_records FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read attendance records"
  ON public.attendance_records FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert attendance records"
  ON public.attendance_records FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can manage all attendance records"
  ON public.attendance_records FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- AI insights policies
CREATE POLICY "Authenticated users can view insights"
  ON public.ai_insights FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can insert insights"
  ON public.ai_insights FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Insert default attendance cutoff time
INSERT INTO public.attendance_settings (key, value)
VALUES ('attendance_cutoff_time', '{"hour": 9, "minute": 0}'::jsonb)
ON CONFLICT (key) DO NOTHING;