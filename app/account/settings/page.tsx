'use client';

import { AppShell } from '@/components/shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings, Construction, Bell, Shield, Palette } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export default function SettingsPage() {
  return (
    <AppShell title="Settings">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
            </CardTitle>
            <CardDescription>Configure how you receive notifications</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="email-notifications">Email Notifications</Label>
                <p className="text-sm text-zinc-500">Receive emails about your content calendar</p>
              </div>
              <Switch id="email-notifications" defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="reminder-notifications">Reminders</Label>
                <p className="text-sm text-zinc-500">Get reminded about upcoming scheduled posts</p>
              </div>
              <Switch id="reminder-notifications" defaultChecked />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Appearance
            </CardTitle>
            <CardDescription>Customize your experience</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <Construction className="h-10 w-10 text-orange-500 mb-4" />
            <p className="text-sm text-zinc-500">Theme customization coming soon</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security
            </CardTitle>
            <CardDescription>Manage your account security</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <Construction className="h-10 w-10 text-orange-500 mb-4" />
            <p className="text-sm text-zinc-500">Security settings coming soon</p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

