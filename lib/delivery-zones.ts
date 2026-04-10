export interface DeliveryZone {
  id: string;
  label: string;
  fee: number;
}

export const deliveryZones: DeliveryZone[] = [
  { id: 'centro-historico', label: 'Centro historico', fee: 7000 },
  { id: 'pescaito', label: 'Pescaito', fee: 7000 },
  { id: 'bavaria', label: 'Bavaria', fee: 8000 },
  { id: 'mamatoco', label: 'Mamatoco', fee: 9000 },
  { id: 'gaira', label: 'Gaira', fee: 10000 },
  { id: 'rodadero', label: 'Rodadero', fee: 10000 },
  { id: 'taganga', label: 'Taganga', fee: 12000 },
];

export function getDeliveryZoneById(zoneId: string) {
  return deliveryZones.find((zone) => zone.id === zoneId);
}
