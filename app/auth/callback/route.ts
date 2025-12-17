import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const redirectTo = searchParams.get('redirectTo') || '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check if user needs org creation (new signup)
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Check if user has an org
        const { data: membership } = await supabase
          .from('org_members')
          .select('org_id')
          .eq('user_id', user.id)
          .single();

        if (!membership) {
          // Create org for new user
          const orgName = user.user_metadata?.org_name || 'My Organization';
          const { data: org, error: orgError } = await supabase
            .from('orgs')
            .insert({ name: orgName })
            .select()
            .single();

          if (!orgError && org) {
            // Add user as admin of the org
            await supabase.from('org_members').insert({
              org_id: org.id,
              user_id: user.id,
              role: 'admin',
            });
          }
        }
      }

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
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
