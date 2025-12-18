import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const redirectTo = searchParams.get('redirectTo') || '/dashboard';

  if (code) {
    const supabase = await createClient();
    
    // Exchange the code for a session - this uses cookies set during signup
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError) {
      // Get the user
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Check if user has an org membership
        const { data: memberships } = await supabase
          .from('org_members')
          .select('org_id')
          .eq('user_id', user.id);

        // If no org membership, create one
        if (!memberships || memberships.length === 0) {
          const orgName = user.user_metadata?.org_name || 'My Organization';
          
          // Try using the admin client to create the org directly
          // since the RPC might not be available
          try {
            const adminClient = createAdminClient();
            
            // Create org
            const { data: newOrg, error: orgError } = await (adminClient
              .from('orgs') as any)
              .insert({ name: orgName, created_by: user.id })
              .select('id')
              .single();

            if (!orgError && newOrg) {
              // Create membership
              await (adminClient
                .from('org_members') as any)
                .insert({
                  org_id: newOrg.id,
                  user_id: user.id,
                  role: 'admin',
                });
            }
          } catch (e) {
            console.error('Failed to create org:', e);
            // Don't block auth, user can create org in onboarding
          }
        }
      }

      // Redirect to the intended destination
      const forwardedHost = request.headers.get('x-forwarded-host');
      const isLocalEnv = process.env.NODE_ENV === 'development';

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${redirectTo}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${redirectTo}`);
      } else {
        return NextResponse.redirect(`${origin}${redirectTo}`);
      }
    }

    // Log the error for debugging
    console.error('Auth code exchange error:', exchangeError);
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}

