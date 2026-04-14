import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { User, Mail, Phone, Stethoscope, Award, Building2, Clock, MapPin } from 'lucide-react';

export default function Profile() {
  const { doctor, doctorClinics, user } = useAuth();

  const profileName = doctor?.name?.trim() || user?.email || 'Doctor Profile';
  const profileSpecialization = doctor?.specialization?.trim() || 'Doctor account';
  const profileQualifications = doctor?.qualifications?.trim() || 'Qualifications not added yet';
  const profilePhone = doctor?.phone?.trim() || 'Phone not added yet';
  const profileEmail = doctor?.email?.trim() || user?.email || 'Email not available';
  const profilePmcNumber = doctor?.pmcNumber?.trim() || 'Not added yet';
  const profileInitials = profileName
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('') || 'DR';

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6 animate-fade-in">
      <h1 className="text-xl font-bold text-foreground">My Profile</h1>

      {/* Doctor card */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-start gap-5">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary shrink-0">
              {profileInitials}
            </div>
            <div className="flex-1 space-y-1">
              <h2 className="text-lg font-bold text-foreground">{profileName}</h2>
              <p className="text-sm text-muted-foreground">{profileSpecialization}</p>
              <p className="text-sm text-muted-foreground">{profileQualifications}</p>
              <Badge variant="outline" className="mt-2 text-xs">PMC Reg: {profilePmcNumber}</Badge>
            </div>
          </div>

          <Separator className="my-5" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { icon: Mail, label: 'Email', value: profileEmail },
              { icon: Phone, label: 'Phone', value: profilePhone },
              { icon: Stethoscope, label: 'Specialization', value: profileSpecialization },
              { icon: Award, label: 'Qualifications', value: profileQualifications },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <item.icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-medium text-foreground">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Assigned clinics */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" /> Assigned Clinics
        </h2>
        <div className="grid gap-3">
          {doctorClinics.map(clinic => (
            <Card key={clinic.id} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center gap-4">
                <span className="text-2xl">{clinic.logo}</span>
                <div className="flex-1">
                  <p className="font-medium text-foreground">{clinic.name}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{clinic.location}, {clinic.city}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{clinic.timings}</span>
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{clinic.phone}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {clinic.specialties.map(s => (
                    <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
