import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatMoney, money, type Moneda } from '@geovanny/shared';
import { api } from '../../lib/api';
import { Seleccion } from '../../components/ui/base';
import type { Caja } from '../../lib/tipos';

/**
 * Elegir en qué caja entra o de dónde sale el dinero.
 *
 * Solo muestra cajas de la moneda de la operación: los bolívares no caben en la
 * caja de pesos. Si no hay ninguna en esa moneda, no estorba —desaparece— y la
 * operación se guarda igual; el control de caja es opcional.
 */
export function SelectorCaja({
  moneda,
  valor,
  onChange,
  etiqueta = '¿Dónde entra la plata?',
}: {
  moneda: Moneda;
  valor: string;
  onChange: (cajaId: string) => void;
  etiqueta?: string;
}) {
  const cajas = useQuery({ queryKey: ['cajas'], queryFn: () => api<Caja[]>('/cajas') });
  const disponibles = (cajas.data ?? []).filter((c) => c.moneda === moneda);

  // Si cambia la moneda de la operación, la caja elegida deja de valer.
  useEffect(() => {
    if (disponibles.length === 0) {
      if (valor) onChange('');
      return;
    }
    if (!disponibles.some((c) => c.id === valor)) {
      onChange(disponibles[0]!.id);
    }
  }, [moneda, disponibles, valor, onChange]);

  if (disponibles.length === 0) return null;

  // Con una sola caja no hay nada que elegir: se informa y ya.
  if (disponibles.length === 1) {
    return (
      <p className="text-xs opacity-60">
        {etiqueta} <strong>{disponibles[0]!.nombre}</strong>
      </p>
    );
  }

  return (
    <Seleccion
      etiqueta={etiqueta}
      valor={valor}
      onChange={onChange}
      opciones={disponibles.map((c) => ({
        valor: c.id,
        texto: `${c.nombre} — ${formatMoney(money(c.saldo, c.moneda))}`,
      }))}
    />
  );
}
