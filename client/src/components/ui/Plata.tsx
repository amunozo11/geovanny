import { formatMoney, money, type Importe, type Moneda } from '@geovanny/shared';
import { useMoneda } from '../../features/moneda/contexto';

/**
 * Muestra dinero en la moneda que el usuario tiene seleccionada.
 *
 * Cuando recibe un `Importe` usa el equivalente que se congeló el día de la
 * operación: no vuelve a convertir nada, así que una venta vieja siempre enseña
 * las cifras de su día (§35).
 *
 * Debajo, en pequeño, deja siempre el valor original en su moneda, para que
 * nunca haya duda de en qué se pactó realmente (§20).
 */
interface PlataProps {
  importe?: Importe;
  /** Alternativa cuando el valor ya viene convertido por el servidor. */
  monto?: string;
  moneda?: Moneda;
  tamano?: 'normal' | 'grande' | 'chico';
  mostrarOriginal?: boolean;
  className?: string;
}

const TAMANOS = {
  chico: 'text-sm',
  normal: 'text-base',
  grande: 'text-2xl font-semibold',
} as const;

export function Plata({
  importe,
  monto,
  moneda,
  tamano = 'normal',
  mostrarOriginal = true,
  className = '',
}: PlataProps) {
  const { moneda: seleccionada } = useMoneda();

  const valor = importe ? importe.eq[seleccionada] : (monto ?? '0');
  const monedaValor = importe ? seleccionada : (moneda ?? seleccionada);

  const original = importe && importe.moneda !== seleccionada ? importe : null;

  return (
    <span className={className}>
      <span className={`tabular ${TAMANOS[tamano]}`}>
        {formatMoney(money(valor, monedaValor))}
      </span>
      {mostrarOriginal && original && (
        <span className="tabular block text-xs opacity-50">
          {formatMoney(money(original.monto, original.moneda))} originales
        </span>
      )}
    </span>
  );
}
