# Geovanny — Gestión comercial multimoneda

> Compras, inventario, ventas de contado y fiado, deudas, abonos y gastos.
> Todo se puede ver en **pesos, dólares o bolívares** con un toque.

---

## Arrancar

Necesitas **Node.js 22 o superior**. Nada más — no hace falta Docker.

```bash
npm install
```

```bash
cp server/.env.example server/.env
```

```bash
npm run seed
```

```bash
npm run dev
```

Abre **http://localhost:5173** y entra con el correo y la contraseña que pusiste
en `server/.env`.

Ese `npm run dev` levanta las cuatro piezas a la vez: la base de datos, el
código compartido, la API y la aplicación.

| Comando | Para qué |
|---|---|
| `npm run dev` | Arrancar todo |
| `npm run seed` | Crear el usuario, los productos base y la tasa inicial |
| `npm test` | Las 129 pruebas |
| `npm run lint` · `npm run typecheck` | Revisar el código |
| `npm run build` | Compilar para producción |

La base de datos guarda los datos en `.mongo-data/`, así que no se pierden al
apagar.

---

## Cómo funciona la moneda

Esta es la idea central del sistema, y conviene entenderla porque explica todo
lo demás.

**Cada operación se guarda con su valor en las tres monedas a la vez.** Cuando
registras una venta de 700.000 bolívares, el sistema anota también cuánto era
eso en dólares y en pesos *ese día*, con la tasa de *ese día*.

Eso tiene dos consecuencias:

1. **El botón COP / USD / VES de arriba cambia toda la aplicación al instante**,
   sin recalcular ni consultar nada. Solo cambia qué valor se lee.
2. **Una venta vieja nunca cambia de valor.** Si mañana el bolívar se devalúa,
   la venta de la semana pasada sigue mostrando lo que valía la semana pasada.
   Es la diferencia entre un registro contable y una hoja de cálculo.

Hay una distinción que la pantalla de inicio dice en voz alta:

- **Lo que ya pasó** (ventas, compras, gastos) se muestra con la tasa que tenía
  el día que ocurrió.
- **Lo que está vivo** (deudas, inventario) se muestra con la tasa de hoy,
  porque es lo que vale hoy.

Y las deudas se llevan **separadas por moneda**: si alguien te debe en dólares y
en bolívares, son dos cuentas distintas, como en el cuaderno.

---

## Las pantallas

| | |
|---|---|
| **Inicio** | Cuánto debes contra cuánto te deben, ventas del día, ganancia del mes, inventario y quién te debe |
| **Vender** | Cliente, productos y guardar. Siempre fiado: se carga a la cuenta del cliente y los abonos se registran desde ahí |
| **Ventas totales** | Lo del mostrador, sin cliente: se toca el producto, se pone cantidad y precio, y se va guardando uno a uno o todos de golpe. Al cerrar, cuánto salió y a cuánto equivale en dólares y en bolívares |
| **Clientes** | Quién debe y cuánto; al entrar, su cuenta completa y el botón de abonar |
| **Inventario** | Crear, editar y quitar productos —el catálogo empieza vacío—, existencias, costo real por bulto, conteos y mermas |
| **Por días** | Todo lo que se registró cada día, en orden y con sus totales |
| **Cajas** | Dónde está el dinero: efectivo por moneda, banco, pago móvil. Conteo y cambio de divisa |
| **Más** | Registrar viaje (compras), tasa del día, gastos y a quién le debes |

---

## Lo que hace por dentro

- **Vender descuenta el inventario y anota la deuda en la misma operación.** Si
  algo falla a mitad, no se guarda nada: nunca queda mercancía descontada por
  una venta que no existe.
- **El cargue del viaje se reparte entre los productos** según lo que valga cada
  uno, así que sabes que el bulto costó 114.000 y no 104.000.
- **Un abono se puede recibir en una moneda y aplicar a una deuda en otra**,
  dejando escrito cuánto entró, cuánto se descontó y con qué tasa.
- **El stock nunca se edita a mano**: cambia por compras, ventas o ajustes con
  motivo obligatorio, y siempre se puede ver por qué es el que es.
- **El dinero tampoco.** Lo que cobras entra a una caja y lo que pagas sale de
  ella, solo. Para cuadrar se cuenta lo que hay y el sistema anota la
  diferencia; nunca se corrige el saldo a dedo.
- **Cambiar bolívares por dólares es mover plata de una caja a otra**, con la
  tasa real de ese cambio guardada.
- **El cierre de un día no se mueve.** Si mañana te abonan una venta fiada de
  hoy, ese abono cuenta en el día del abono; hoy sigue mostrando lo que pasó hoy.
- **El día es el tuyo, no el del servidor**: una venta de las 8 de la noche
  pertenece a ese día, aunque el reloj en UTC ya marque el siguiente.
- **Ningún cálculo de dinero usa decimales de computadora.** Todo va con
  precisión exacta, y hay una regla automática que impide romperlo sin darse
  cuenta.

---

## Publicarlo en internet

Todo el despliegue está preparado: `vercel.json`, `render.yaml` y `Dockerfile`
en la raíz, y el paso a paso en **[DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

Se publica **una sola cosa**: el mismo servidor entrega la aplicación y la API,
así que hay una sola dirección y un solo despliegue. La base de datos va en
MongoDB Atlas (gratis para empezar). Al arrancar, el servidor se prepara solo.

```bash
npm run build && npm start
```

> ⚠️ **Esta instalación va sin contraseña** (`ACCESO_ABIERTO=true`, decidido el
> 20/08/2026). Cualquiera que conozca la dirección entra como administrador y ve
> las deudas de tus clientes, sus teléfonos y tu dinero. No compartas la
> dirección. Para cerrar la puerta basta con poner esa variable en `false` y
> reiniciar: vuelve la pantalla de entrada y no se pierde nada.

---

## Documentación

| Documento | Qué contiene |
|---|---|
| [ANALISIS_CUADERNO.md](docs/ANALISIS_CUADERNO.md) | **Análisis del Excel real del negocio** y los errores que se encontraron en él |
| [BUSINESS_RULES.md](docs/BUSINESS_RULES.md) | Todas las reglas, las confirmadas y las que faltan por confirmar |
| [DATABASE.md](docs/DATABASE.md) | Cómo se guardan los datos |
| [EXCHANGE_RATES.md](docs/EXCHANGE_RATES.md) | De dónde salen las tasas y por qué la del bolívar es delicada |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Estructura del código |
| [UX_FLOW.md](docs/UX_FLOW.md) | Diseño de las pantallas |
| [ROADMAP.md](docs/ROADMAP.md) | Qué está hecho y qué falta |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Cómo publicarlo cuando llegue el momento |
| [TESTING.md](docs/TESTING.md) · [API.md](docs/API.md) · [ENVIRONMENT.md](docs/ENVIRONMENT.md) | Pruebas, API y variables de entorno |

---

## Estado

**Funcionando:** entrar al sistema, productos, clientes y proveedores, viajes de
compra con cargue, ventas de contado y fiado, abonos entre monedas, inventario
con mermas, gastos, tasas del día, control de caja con cambio de divisa,
**vista por días** e inicio en tres monedas.

**Sin preguntas pendientes.** Las decisiones tomadas están en
[BUSINESS_RULES.md](docs/BUSINESS_RULES.md).

**Descartado a propósito** (20/08/2026): las deudas no vencen, la aplicación no
se instala en el teléfono y no hay descarga de informes. Se usa desde el
navegador y la información se consulta en pantalla.
