import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Stethoscope, Lock, Mail, Eye, EyeOff, Phone, BadgeCheck, Building2, MapPin, UserRound, GraduationCap } from 'lucide-react';

const defaultSignup = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  pmcNumber: '',
  specialization: '',
  qualifications: '',
  clinicName: '',
  city: '',
  notes: '',
};

export default function LoginPage() {
  const { login, openDemo, signup } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [signupForm, setSignupForm] = useState(defaultSignup);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateSignup = (field: keyof typeof defaultSignup, value: string) => {
    setSignupForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);

    try {
      await login(email, password);
    } catch (error) {
      if (error instanceof ApiError) {
        setError(error.message);
      } else {
        setError('Unable to sign in right now.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);

    try {
      const message = await signup(signupForm);
      setSuccess(message);
      setSignupForm(defaultSignup);
      setMode('signin');
    } catch (error) {
      if (error instanceof ApiError) {
        setError(error.message);
      } else {
        setError('Unable to submit signup request right now.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoLogin = async () => {
    setError('');
    setSuccess('');
    setIsSubmitting(true);

    try {
      await openDemo();
    } catch (error) {
      if (error instanceof ApiError) {
        setError(error.message);
      } else {
        setError('Unable to open demo right now.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--gradient-hero)' }}>
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-16 text-primary-foreground">
        <div className="w-full max-w-xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-primary-foreground/10 backdrop-blur flex items-center justify-center">
              <Stethoscope className="w-7 h-7 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold tracking-tight">My Health</span>
          </div>
          <h1 className="text-5xl font-extrabold leading-tight mb-4">
            Doctor Patient
            <br />
            Management System
          </h1>
          <p className="text-lg text-primary-foreground/70 max-w-md">
            Streamline your OPD workflow. Manage consultations, prescriptions, and patient records across multiple clinics, all in one platform.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-16">
        <Card className="w-full max-w-xl border-0 shadow-2xl">
          <CardContent className="p-8">
            <div className="lg:hidden flex items-center gap-2 mb-6">
              <Stethoscope className="w-6 h-6 text-primary" />
              <span className="text-xl font-bold text-foreground">My Health</span>
            </div>

            <div className="inline-flex rounded-lg border border-border bg-muted/30 p-1 mb-6">
              <Button
                type="button"
                variant={mode === 'signin' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8"
                onClick={() => {
                  setMode('signin');
                  setError('');
                  setSuccess('');
                }}
              >
                Sign In
              </Button>
              <Button
                type="button"
                variant={mode === 'signup' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8"
                onClick={() => {
                  setMode('signup');
                  setError('');
                  setSuccess('');
                }}
              >
                Request Access
              </Button>
            </div>

            <h2 className="text-2xl font-bold text-foreground mb-1">
              {mode === 'signin' ? 'Welcome back' : 'Doctor signup'}
            </h2>
            <p className="text-muted-foreground mb-8">
              {mode === 'signin'
                ? 'Sign in to your doctor portal'
                : 'Submit your profile for admin approval before workspace access'}
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 rounded-lg bg-success/10 text-success text-sm">
                {success}
              </div>
            )}

            {mode === 'signin' ? (
              <form onSubmit={handleSignIn} className="space-y-5">
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

                <Button type="submit" className="w-full h-11 text-base font-semibold" disabled={isSubmitting}>
                  {isSubmitting ? 'Signing In...' : 'Sign In'}
                </Button>
                <Button type="button" variant="outline" className="w-full h-11 text-base font-semibold" disabled={isSubmitting} onClick={() => void handleDemoLogin()}>
                  Try Demo
                </Button>
              </form>
            ) : (
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <div className="relative">
                      <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input value={signupForm.fullName} onChange={e => updateSignup('fullName', e.target.value)} className="pl-10" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input value={signupForm.phone} onChange={e => updateSignup('phone', e.target.value)} className="pl-10" />
                    </div>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input type="email" value={signupForm.email} onChange={e => updateSignup('email', e.target.value)} className="pl-10" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input type={showPassword ? 'text' : 'password'} value={signupForm.password} onChange={e => updateSignup('password', e.target.value)} className="pl-10 pr-10" />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>PMC / Registration No.</Label>
                    <div className="relative">
                      <BadgeCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input value={signupForm.pmcNumber} onChange={e => updateSignup('pmcNumber', e.target.value)} className="pl-10" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Specialization</Label>
                    <div className="relative">
                      <Stethoscope className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input value={signupForm.specialization} onChange={e => updateSignup('specialization', e.target.value)} className="pl-10" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Qualifications</Label>
                    <div className="relative">
                      <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        value={signupForm.qualifications}
                        onChange={e => updateSignup('qualifications', e.target.value)}
                        className="pl-10"
                        placeholder="MBBS, FCPS, MRCP"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Clinic / Business Name</Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input value={signupForm.clinicName} onChange={e => updateSignup('clinicName', e.target.value)} className="pl-10" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>City</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input value={signupForm.city} onChange={e => updateSignup('city', e.target.value)} className="pl-10" />
                    </div>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Notes</Label>
                    <Textarea rows={3} value={signupForm.notes} onChange={e => updateSignup('notes', e.target.value)} placeholder="Optional onboarding notes for admin review" />
                  </div>
                </div>

                <Button type="submit" className="w-full h-11 text-base font-semibold" disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting...' : 'Submit for Approval'}
                </Button>
              </form>
            )}

            <p className="text-center text-xs text-muted-foreground mt-6">
              Try Demo opens a fresh sample workspace each time.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
