import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FlaskConical, Scan, Stethoscope, ArrowRightLeft, Plus, Building2, CalendarPlus } from 'lucide-react';
import type { CareAction, ClinicalNote, LabOrder, Procedure } from '@/data/mockData';

const orderCategories = [
  { id: 'lab', label: 'Laboratory', icon: FlaskConical, color: 'text-warning' },
  { id: 'radiology', label: 'Radiology', icon: Scan, color: 'text-info' },
  { id: 'procedure', label: 'Procedures', icon: Stethoscope, color: 'text-primary' },
  { id: 'referral', label: 'Referrals', icon: ArrowRightLeft, color: 'text-destructive' },
  { id: 'admission', label: 'Admissions', icon: Building2, color: 'text-muted-foreground' },
  { id: 'followup', label: 'Follow-ups', icon: CalendarPlus, color: 'text-accent' },
];

interface OrdersPanelProps {
  activeOrders: LabOrder[];
  activeProcedures: Procedure[];
  activeCareActions: CareAction[];
  previousNotes: ClinicalNote[];
  onQuickAdd: (categoryId: 'lab' | 'radiology' | 'procedure' | 'referral' | 'admission' | 'followup') => void;
}

export default function OrdersPanel({ activeOrders, activeProcedures, activeCareActions, previousNotes, onQuickAdd }: OrdersPanelProps) {
  const historicalOrders = previousNotes.flatMap(note =>
    note.labOrders.map(order => ({
      ...order,
      date: note.date,
    }))
  );

  const historicalCareActions = previousNotes.flatMap(note => note.careActions ?? []);
  const historicalProcedures = previousNotes.flatMap(note => note.procedures ?? []);

  const orders = [...activeOrders, ...historicalOrders];
  const careActions = [...activeCareActions, ...historicalCareActions];
  const procedures = [...activeProcedures, ...historicalProcedures];
  const labOrders = orders.filter(order => {
    const category = order.category.toLowerCase();
    return !['radiology', 'ct', 'mri', 'ultrasound', 'x-ray', 'xray'].some(keyword => category.includes(keyword));
  });
  const radiologyOrders = orders.filter(order => {
    const category = order.category.toLowerCase();
    return ['radiology', 'ct', 'mri', 'ultrasound', 'x-ray', 'xray'].some(keyword => category.includes(keyword));
  });

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Quick add buttons */}
      <div className="flex flex-wrap gap-2">
        {orderCategories.map(cat => {
          const Icon = cat.icon;
          return (
            <Button key={cat.id} variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => onQuickAdd(cat.id as 'lab' | 'radiology' | 'procedure' | 'referral' | 'admission' | 'followup')}>
              <Icon className={`w-3.5 h-3.5 ${cat.color}`} />
              {cat.label}
              <Plus className="w-3 h-3" />
            </Button>
          );
        })}
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold text-foreground text-sm">Procedures</h3>
        {procedures.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No procedures recorded yet
            </CardContent>
          </Card>
        ) : (
          procedures.map(procedure => (
            <Card key={procedure.id} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10">
                  <Stethoscope className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{procedure.name}</p>
                  <p className="text-xs text-muted-foreground">{procedure.notes || procedure.category}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">{procedure.category}</Badge>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold text-foreground text-sm">Care Actions</h3>
        {careActions.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No referrals, admissions, or follow-up actions yet
            </CardContent>
          </Card>
        ) : (
          careActions.map(action => (
            <Card key={action.id} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${action.type === 'referral' ? 'bg-destructive/10' : action.type === 'admission' ? 'bg-muted/50' : 'bg-primary/10'}`}>
                  {action.type === 'referral' ? <ArrowRightLeft className="w-4 h-4 text-destructive" /> : action.type === 'admission' ? <Building2 className="w-4 h-4 text-muted-foreground" /> : <CalendarPlus className="w-4 h-4 text-primary" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{action.title}</p>
                  <p className="text-xs text-muted-foreground">{action.notes || action.actionDate || action.type}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">{action.urgency}</Badge>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Orders list */}
      <div className="space-y-3">
        <h3 className="font-semibold text-foreground text-sm">Recent Orders</h3>
        {orders.length === 0 && (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No lab, radiology, or follow-up orders available yet
            </CardContent>
          </Card>
        )}
        {labOrders.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Lab Orders</p>
            {labOrders.map(order => (
              <Card key={order.id} className="border-0 shadow-sm">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-warning/10">
                    <FlaskConical className="w-4 h-4 text-warning" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{order.testName}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(order.date).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${order.priority === 'urgent' ? 'border-destructive/30 text-destructive' : ''}`}>
                    {order.priority}
                  </Badge>
                  <Badge variant="outline" className={`text-[10px] ${order.status === 'resulted' ? 'bg-success/10 text-success border-success/20' : 'bg-warning/10 text-warning border-warning/20'}`}>
                    {order.status}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {radiologyOrders.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Radiology</p>
            {radiologyOrders.map(order => (
              <Card key={order.id} className="border-0 shadow-sm">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-info/10">
                    <Scan className="w-4 h-4 text-info" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{order.testName}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(order.date).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${order.priority === 'urgent' ? 'border-destructive/30 text-destructive' : ''}`}>
                    {order.priority}
                  </Badge>
                  <Badge variant="outline" className={`text-[10px] ${order.status === 'resulted' ? 'bg-success/10 text-success border-success/20' : 'bg-warning/10 text-warning border-warning/20'}`}>
                    {order.status}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
