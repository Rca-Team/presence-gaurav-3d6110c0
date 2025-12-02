import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// import { Resend } from "npm:resend@2.0.0" // Temporarily disabled
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts"

console.log('Email notification function started');

// const resend = new Resend(Deno.env.get('RESEND_API_KEY')); // Temporarily disabled

console.log('Configuration check:', {
  hasResendKey: !!Deno.env.get('RESEND_API_KEY')
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const notificationSchema = z.object({
  recipient: z.object({
    email: z.string().email().max(255),
    name: z.string().max(100).optional()
  }),
  message: z.object({
    subject: z.string().min(1).max(200),
    body: z.string().min(1).max(5000)
  }),
  student: z.object({
    id: z.string().uuid(),
    name: z.string().max(100),
    status: z.enum(['present', 'late', 'absent'])
  }).optional()
});

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

serve(async (req) => {
  console.log('Received request:', req.method);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client with auth
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! }
        }
      }
    );

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError || !user) {
      console.error('Authentication failed:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Authentication required' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Check if user is admin
    const { data: roleData, error: roleError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (roleError || !roleData) {
      console.error('Authorization check failed:', roleError);
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin access required' }),
        { 
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('User authenticated and authorized:', user.id);
    
    const requestBody = await req.json();
    
    // Validate input
    const validationResult = notificationSchema.safeParse(requestBody);
    if (!validationResult.success) {
      console.error("Validation error:", validationResult.error);
      return new Response(
        JSON.stringify({ error: "Invalid request data" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }
    
    const { recipient, message, student } = validationResult.data;
    console.log("Notification request:", { recipient: recipient.email, hasStudent: !!student });
    
    if (!Deno.env.get('RESEND_API_KEY')) {
      console.error('RESEND_API_KEY not configured');
      throw new Error('Email service not configured');
    }

    try {
      console.log('Sending email to:', recipient.email);
      
      // Use verified domain for sending emails
      const fromAddress = 'School Attendance <presence@electronicgaurav.me>';
      
      // Determine status colors and labels
      const statusColor = student?.status === 'present' ? '#28a745' : student?.status === 'late' ? '#ffc107' : '#dc3545';
      const statusBadge = student?.status === 'present' ? 'ON TIME' : student?.status === 'late' ? 'LATE ARRIVAL' : 'ABSENT';
      const statusText = student?.status === 'present' ? 'Present ✓' : student?.status === 'late' ? 'Late ⏰' : 'Absent ✗';

      // Email sending temporarily disabled - Resend integration pending
      console.log('Would send email notification to:', recipient.email);
      console.log('Subject:', message.subject || 'School Notification');
      
      // Simulate success for now
      console.log('Email sent successfully (simulated)');
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Email notification queued (email service pending configuration)',
          details: {
            emailSent: false,
            pending: true
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        } 
      );
      
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
      throw new Error(`Email sending failed: ${(emailError as Error).message}`);
    }

  } catch (error) {
    console.error('Error sending notification:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to send notification. Please try again or contact support.',
        support_id: crypto.randomUUID()
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
  }
})