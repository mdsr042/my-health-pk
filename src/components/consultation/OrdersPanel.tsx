import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FlaskConical, Scan, Stethoscope, ArrowRightLeft, Plus, Building2, CalendarPlus } from 'lucide-react';

const sampleOrders = [
  { id: '1', type: 'lab', name: 'Complete Blood Count', priority: 'routine', status: 'ordered', date: '2026-03-31' },
  { id: '2', type: 'lab', name: 'Liver Function Tests', priority: 'routine', status: 'resulted', date: '2026-03-28' },
  { id: '3', type: 'radiology', name: 'Chest X-Ray PA View', priority: 'urgent', status: 'ordered', date: '2026-03-31' },
  { id: '4', type: 'radiology', name: 'Ultrasound Abdomen', priority: 'routine', status: 'resulted', date: '2026-03-25' },
];

const orderCategories = [
  { id: 'lab', label: 'Laboratory', icon: FlaskConical, color: 'text-warning' },
  { id: 'radiology', label: 'Radiology', icon: Scan, color: 'text-info' },
  { id: 'procedure', label: 'Procedures', icon: Stethoscope, color: 'text-primary' },
  { id: 'referral', label: 'Referrals', icon: ArrowRightLeft, color: 'text-destructive' },
  { id: 'admission', label: 'Admissions', icon: Building2, color: 'text-muted-foreground' },
  { id: 'followup', label: 'Follow-ups', icon: CalendarPlus, color: 'text-accent' },
];

export default function OrdersPanel() {
  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Quick add buttons */}
      <div className="flex flex-wrap gap-2">
        {orderCategories.map(cat => {
          const Icon = cat.icon;
          return (
            <Button key={cat.id} variant="outline" size="sm" className="gap-1.5 text-xs">
              <Icon className={`w-3.5 h-3.5 ${cat.color}`} />
              {cat.label}
              <Plus className="w-3 h-3" />
            </Button>
          );
        })}
      </div>

      {/* Orders list */}
      <div className="space-y-3">
        <h3 className="font-semibold text-foreground text-sm">Recent Orders</h3>
        {sampleOrders.map(order => (
          <Card key={order.id} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${order.type === 'lab' ? 'bg-warning/10' : 'bg-info/10'}`}>
                {order.type === 'lab' ? <FlaskConical className="w-4 h-4 text-warning" /> : <Scan className="w-4 h-4 text-info" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{order.name}</p>
                <p className="text-xs text-muted-foreground">{order.date}</p>
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
    </div>
  );
}
