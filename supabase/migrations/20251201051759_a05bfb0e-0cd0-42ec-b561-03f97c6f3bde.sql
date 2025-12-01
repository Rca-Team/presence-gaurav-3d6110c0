-- Create face_descriptors table for adaptive learning
CREATE TABLE IF NOT EXISTS public.face_descriptors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  descriptor text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  confidence_score numeric,
  image_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_face_descriptors_user_id ON public.face_descriptors(user_id);
CREATE INDEX IF NOT EXISTS idx_face_descriptors_captured_at ON public.face_descriptors(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_face_descriptors_confidence ON public.face_descriptors(confidence_score DESC NULLS LAST);

-- Enable RLS
ALTER TABLE public.face_descriptors ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all descriptors (needed for recognition)
CREATE POLICY "Allow authenticated users to read face descriptors"
  ON public.face_descriptors
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow system to insert new descriptors
CREATE POLICY "Allow authenticated users to insert face descriptors"
  ON public.face_descriptors
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow system to delete old descriptors  
CREATE POLICY "Allow authenticated users to delete face descriptors"
  ON public.face_descriptors
  FOR DELETE
  TO authenticated
  USING (true);

-- Allow public access for recognition (needed when users aren't authenticated yet)
CREATE POLICY "Allow public to read face descriptors"
  ON public.face_descriptors
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public to insert face descriptors"
  ON public.face_descriptors
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Add comment
COMMENT ON TABLE public.face_descriptors IS 'Stores multiple face descriptors per user for adaptive learning and improved recognition accuracy';