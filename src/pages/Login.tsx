import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Stethoscope, Lock, Mail, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('dr.ahmed@medcare.pk');
  const [password, setPassword] = useState('password');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!login(email, password)) {
      setError('Invalid credentials. Try dr.ahmed@medcare.pk');
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--gradient-hero)' }}>
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-16 text-primary-foreground">
        <div className="w-full max-w-xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-primary-foreground/10 backdrop-blur flex items-center justify-center">
              <Stethoscope className="w-7 h-7 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold tracking-tight">My Health</span>
          </div>
          <h1 className="text-5xl font-extrabold leading-tight mb-4">
            Doctor Patient<br />Management System
          </h1>
          <p className="text-lg text-primary-foreground/70 max-w-md">
            Streamline your OPD workflow. Manage consultations, prescriptions, and patient records across multiple clinics — all in one platform.
          </p>
          <div className="mt-12 flex gap-8 text-primary-foreground/50 text-sm">
            <div><span className="block text-2xl font-bold text-primary-foreground">500+</span>Doctors</div>
            <div><span className="block text-2xl font-bold text-primary-foreground">1M+</span>Patients</div>
            <div><span className="block text-2xl font-bold text-primary-foreground">50+</span>Hospitals</div>
          </div>
        </div>
      </div>

      {/* Right login form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-16">
        <Card className="w-full max-w-md border-0 shadow-2xl">
          <CardContent className="p-8">
            <div className="lg:hidden flex items-center gap-2 mb-6">
              <Stethoscope className="w-6 h-6 text-primary" />
              <span className="text-xl font-bold text-foreground">My Health</span>
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-1">Welcome back</h2>
            <p className="text-muted-foreground mb-8">Sign in to your doctor portal</p>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="doctor@clinic.pk"
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full h-11 text-base font-semibold">
                Sign In
              </Button>
            </form>

            <p className="text-center text-xs text-muted-foreground mt-6">
              Demo: dr.ahmed@medcare.pk / any password
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
