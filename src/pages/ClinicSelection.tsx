import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Clock, Stethoscope, ChevronRight } from 'lucide-react';

export default function ClinicSelection() {
  const { doctor, doctorClinics, selectClinic } = useAuth();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="mb-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Stethoscope className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Select Clinic</h1>
        <p className="text-muted-foreground mt-1">Welcome, {doctor?.name}. Choose your active practice.</p>
      </div>

      <div className="grid gap-4 w-full max-w-2xl">
        {doctorClinics.map(clinic => (
          <Card
            key={clinic.id}
            className="cursor-pointer hover:shadow-lg hover:border-primary/30 transition-all group"
            onClick={() => selectClinic(clinic.id)}
          >
            <CardContent className="p-6 flex items-center gap-5">
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center text-2xl shrink-0">
                {clinic.logo}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground text-lg">{clinic.name}</h3>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{clinic.location}, {clinic.city}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{clinic.timings}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {clinic.specialties.map(s => (
                    <span key={s} className="px-2 py-0.5 rounded-full text-xs bg-secondary text-secondary-foreground">{s}</span>
                  ))}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
