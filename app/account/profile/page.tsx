'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, Mail, Building } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function ProfilePage() {
  const [userEmail, setUserEmail] = useState<string>('');
  const [orgName, setOrgName] = useState<string>('');

  useEffect(() => {
    const loadUserData = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user?.email) {
        setUserEmail(user.email);
      }

      // Get org name
      if (user) {
        const { data: membership } = await supabase
          .from('org_members')
          .select('orgs(name)')
          .eq('user_id', user.id)
          .limit(1);

        if (membership && membership.length > 0) {
          const org = (membership[0] as any).orgs;
          if (org?.name) {
            setOrgName(org.name);
          }
        }
      }
    };
    loadUserData();
  }, []);

  const avatarInitial = userEmail ? userEmail.charAt(0).toUpperCase() : 'U';

  return (
    <AppShell title="Profile">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Your Profile</CardTitle>
            <CardDescription>Manage your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar Section */}
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src="" alt="User" />
                <AvatarFallback className="bg-gradient-to-br from-orange-500 to-red-600 text-white text-2xl">
                  {avatarInitial}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold text-lg">{userEmail || 'Loading...'}</h3>
                <p className="text-sm text-zinc-500">{orgName || 'No organization'}</p>
              </div>
            </div>

            {/* Email (read-only) */}
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={userEmail}
                disabled
                className="bg-zinc-50 dark:bg-zinc-900"
              />
              <p className="text-xs text-zinc-500">Email cannot be changed</p>
            </div>

            {/* Organization (read-only) */}
            <div className="space-y-2">
              <Label htmlFor="org" className="flex items-center gap-2">
                <Building className="h-4 w-4" />
                Organization
              </Label>
              <Input
                id="org"
                type="text"
                value={orgName}
                disabled
                className="bg-zinc-50 dark:bg-zinc-900"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

