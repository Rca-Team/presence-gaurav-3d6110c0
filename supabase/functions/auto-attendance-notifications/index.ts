import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from "npm:resend@2.0.0"

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

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get cutoff time setting
    const { data: cutoffData } = await supabaseClient
      .from('attendance_settings')
      .select('value')
      .eq('key', 'cutoff_time')
      .single();

    if (!cutoffData) {
      throw new Error('Cutoff time not configured');
    }

    const cutoffTime = cutoffData.value;
    const today = new Date().toISOString().split('T')[0];

    // Get all registered users (users who have profile data)
    const { data: profiles } = await supabaseClient
      .from('profiles')
      .select('user_id, display_name, parent_email, parent_name')
      .not('parent_email', 'is', null);

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No registered users with parent emails found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get today's attendance records for all users
    const { data: todayAttendance } = await supabaseClient
      .from('attendance_records')
      .select('user_id, status, timestamp, device_info')
      .gte('timestamp', `${today}T00:00:00`)
      .lte('timestamp', `${today}T23:59:59`)
      .neq('status', 'pending_approval');

    const notificationResults = [];

    for (const profile of profiles) {
      const userId = profile.user_id;
      const studentName = profile.display_name || 'Student';

      if (!profile.parent_email) {
        console.log(`No parent email for ${studentName}`);
        continue;
      }

      // Find user's attendance record for today
      const userAttendance = todayAttendance?.find(a => a.user_id === userId);

      let emailSubject = '';
      let emailBody = '';
      let attendanceTime = '';
      let attendanceDate = '';

      if (!userAttendance) {
        // Absent - no record for today
        attendanceDate = new Date().toLocaleDateString();
        emailSubject = `Absence Alert - ${studentName}`;
        emailBody = `Dear ${profile.parent_name || 'Parent/Guardian'},\n\nThis is to inform you that ${studentName} was marked absent today.\n\nDate: ${attendanceDate}\n\nIf this is unexpected, please contact the school immediately.\n\nBest regards,\nSchool Administration`;
      } else if (userAttendance.status === 'late') {
        // Late arrival - use actual timestamp from record
        const recordTimestamp = new Date(userAttendance.timestamp);
        attendanceTime = recordTimestamp.toLocaleTimeString();
        attendanceDate = recordTimestamp.toLocaleDateString();
        emailSubject = `Late Arrival Notification - ${studentName}`;
        emailBody = `Dear ${profile.parent_name || 'Parent/Guardian'},\n\nThis is to inform you that ${studentName} arrived late to school.\n\nTime: ${attendanceTime}\nDate: ${attendanceDate}\n\nPlease ensure punctuality in the future.\n\nBest regards,\nSchool Administration`;
      } else if (userAttendance.status === 'present') {
        // Present - on time - use actual timestamp from record
        const recordTimestamp = new Date(userAttendance.timestamp);
        attendanceTime = recordTimestamp.toLocaleTimeString();
        attendanceDate = recordTimestamp.toLocaleDateString();
        emailSubject = `Attendance Confirmation - ${studentName}`;
        emailBody = `Dear ${profile.parent_name || 'Parent/Guardian'},\n\nThis is to inform you that ${studentName} has arrived at school safely.\n\nTime: ${attendanceTime}\nDate: ${attendanceDate}\n\nBest regards,\nSchool Administration`;
      }

      if (emailBody) {
        try {
          const statusColor = userAttendance?.status === 'present' ? '#28a745' : userAttendance?.status === 'late' ? '#ffc107' : '#dc3545';
          const statusText = userAttendance?.status === 'present' ? 'Present ✓' : userAttendance?.status === 'late' ? 'Late ⏰' : 'Absent ✗';
          const statusBadge = userAttendance?.status === 'present' ? 'ON TIME' : userAttendance?.status === 'late' ? 'LATE ARRIVAL' : 'ABSENT';

          const emailResponse = await resend.emails.send({
            from: 'School Attendance <presence@electronicgaurav.me>',
            to: [profile.parent_email],
            subject: emailSubject,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 30px;">
                  <h1 style="color: white; margin: 0; font-size: 24px;">School Attendance System</h1>
                </div>
                
                <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 20px;">
                  <div style="text-align: center; margin-bottom: 25px;">
                    <span style="display: inline-block; background: ${statusColor}; color: white; padding: 12px 24px; border-radius: 25px; font-weight: bold; font-size: 16px; letter-spacing: 1px;">
                      ${statusBadge}
                    </span>
                  </div>
                  
                    <div style="background: #f8f9fa; padding: 25px; border-radius: 8px; border-left: 4px solid ${statusColor}; margin-bottom: 25px;">
                    <h2 style="color: #333; margin-top: 0; font-size: 20px;">Attendance Details</h2>
                    <div style="color: #555; line-height: 1.8; font-size: 16px;">
                      <p style="margin: 10px 0;"><strong>Student:</strong> ${escapeHtml(studentName)}</p>
                      <p style="margin: 10px 0;"><strong>Date:</strong> ${escapeHtml(attendanceDate)}</p>
                      ${attendanceTime ? `<p style="margin: 10px 0;"><strong>Time:</strong> ${escapeHtml(attendanceTime)}</p>` : ''}
                      <p style="margin: 10px 0;"><strong>Status:</strong> <span style="color: ${statusColor}; font-weight: bold;">${escapeHtml(statusText)}</span></p>
                    </div>
                  </div>
                  
                  <div style="background: #f0f4ff; padding: 20px; border-radius: 8px; border: 1px solid #d0d9ff;">
                    <p style="color: #333; line-height: 1.6; margin: 0; font-size: 15px;">
                      ${emailBody.replace(/\n/g, '<br>')}
                    </p>
                  </div>
                </div>
                
                <div style="text-align: center; padding: 20px;">
                  <p style="color: #666; font-size: 14px; margin: 0;">
                    This is an automated daily attendance notification.<br>
                    Please do not reply to this email.
                  </p>
                </div>
              </div>
            `,
          });

          notificationResults.push({
            student: studentName,
            status: userAttendance?.status || 'absent',
            emailSent: !emailResponse.error,
            error: emailResponse.error?.message
          });

        } catch (error) {
          console.error(`Failed to send email for ${studentName}:`, error);
          notificationResults.push({
            student: studentName,
            status: userAttendance?.status || 'absent',
            emailSent: false,
            error: error.message
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Automatic notifications processed',
        results: notificationResults
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in auto-notifications:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Notification service error',
        support_id: crypto.randomUUID()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
})