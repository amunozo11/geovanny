# ROADMAP.md — Prioridades, MVP y plan de implementación (§50, §60, §61)

---

## 1. Criterio de priorización

> Lo CRÍTICO es lo que hoy el comerciante ya hace en el cuaderno y no puede dejar de hacer.
> Si el sistema no lo cubre, vuelve al cuaderno el primer día.

---

## 2. Clasificación de funcionalidades (§60)

### 🔴 CRÍTICO — sin esto el negocio no opera

| Funcionalidad                                            | Referencia        |
| -------------------------------------------------------- | ----------------- |
| Login y sesión                                           | §42, §43          |
| Productos con unidad configurable                        | §9                |
| Clientes con saldo y semáforo                            | §23               |
| Compras = **viajes**, con cargue y costo real            | §11, §12, `CN-14` |
| **Cuentas por pagar a proveedores + abonos numerados**   | `CN-13`, `D-1`    |
| **Cuenta de transporte por viaje y conductor (USD)**     | `CN-20`, `D-4`    |
| **Mercancía "en la raya"** (en tránsito)                 | `CN-19`, `D-5`    |
| Saldo a favor de cliente y de proveedor                  | `CN-17`           |
| Inventario trazable por movimientos                      | §10               |
| **Venta rápida** (multi-producto, contado/fiado/parcial) | §13, §15, §59     |
| Cuentas por cobrar automáticas                           | §5, §6            |
| Abonos parciales, múltiples                              | §7                |
| Multimoneda COP/USD/VES con tasa manual                  | §3                |
| **Snapshot de tasa histórica**                           | §4, §21, §35      |
| Estado de cuenta del cliente                             | §6                |
| Dashboard **"Debo vs Me deben"**                         | §38, `CN-23`      |
| Responsive real móvil                                    | §27, §54          |

### 🟡 IMPORTANTE — mejora sustancial, no bloquea el arranque

Auto-fetch de tasas · Módulo de cambio de moneda (§16) · Gastos fijos y variables (§17) ·
Dashboard completo (§18) · Conversión de visualización (§19, §20) · Búsqueda global (§25) ·
Alertas de stock bajo (§41) · Auditoría consultable (§22) · Proveedores (§24) ·
Precio especial por cliente (§14) · Utilidad y diferencia cambiaria separadas (§56, §57) ·
Roles (§42)

### ⛔ DESCARTADO — decidido el 20/08/2026, no se construye

| Qué | Por qué |
|---|---|
| **Vencimiento de deudas** | Las deudas no vencen. Sin plazos, sin intereses, sin marcar morosos (`RC-31`) |
| **Instalación como app en el teléfono** (PWA) | Se usa desde el navegador. La pantalla ya está hecha para el móvil |
| **Funcionamiento sin señal** (offline) | Depende de lo anterior y añadía el riesgo de ventas duplicadas al sincronizar |
| **Descarga de informes** (PDF, Excel, CSV) | La información se consulta en pantalla |
| **Recordatorios automáticos de cobro** | Coherente con que las deudas no vencen |
| **Límite de crédito por cliente** | Se fía según la confianza, no según un tope del sistema (`RP-17`) |

### 🟢 FUTURO — cuando el sistema esté en uso real

Devoluciones y notas de crédito (`RP-18`) ·
Multi-sucursal · Códigos de barras · Multi-negocio

---

## 3. MVP (§61) — definición de "terminado"

El MVP está listo cuando el comerciante puede **cerrar el archivo de Excel**, es decir cuando
puede reemplazar sus 9 hojas:

| Su hoja                         | Reemplazada por                               |
| ------------------------------- | --------------------------------------------- |
| `DEUDAS`                        | Dashboard "Debo vs Me deben"                  |
| `PROV-JULITO/SEBASTIAN/HIJINIO` | Cuentas por pagar + abonos                    |
| `JOSE QUEMAO`                   | Cuenta de transporte por viaje y conductor    |
| `CLIENTES No. 1`                | Cuentas por cobrar con matriz cliente × fecha |
| `WILMER`                        | Vista de cobro filtrada por rol               |
| `STOCK`                         | Inventario + ventas con detalle de producto   |

Y concretamente:

1. Entrar desde el celular.
2. Registrar un viaje de 661 bultos a 104.000 COP con su cargue, a crédito, y ver el costo real.
3. Abonar 10.000.000 COP a Hijinio, con hora y marca `Ok`, y ver la deuda bajar.
4. Vender 20 bultos de papa a MEMIN a 35.000 Bs, fiado, en menos de 15 segundos.
5. Ver que el stock de papa bajó de 385 a 365 **y** que el saldo de MEMIN subió — con una sola
   anotación, no dos (esto es lo que hoy no existe).
6. Recibir un abono parcial en otra moneda, eligiendo la tasa.
7. Consultar cuánto le debe cada cliente en USD y en Bs, por separado.
8. Ver "cuánto debo vs cuánto me deben" consolidado, con **una sola tasa** para todo el sistema.
9. Confiar en que una venta de la semana pasada sigue mostrando la tasa de la semana pasada.

**Fuera del MVP:** devoluciones y varios usuarios a la vez.
Descartado del todo: vencimiento de deudas, instalación en el teléfono,
funcionamiento sin señal y descarga de informes (ver arriba).

---

## 4. Plan de implementación por fases (§50)

Cada fase termina **funcional y probada** antes de pasar a la siguiente (§71). Al final de
cada una se puede abrir la app y usar lo construido.

|  Fase  | Contenido                                                                                                              | Entregable verificable                                                         |
| :----: | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **0**  | ✅ Análisis, arquitectura, modelo, reglas, UX, API, roadmap                                                            | Los 12 documentos de `/docs`                                                   |
| **1** ✅ | Monorepo npm, Vite+React 19+TS+Tailwind v4, Express 5+TS, Mongoose, ESLint/Prettier, env validado, healthcheck, **núcleo de dinero y tasas con 51 pruebas** | `npm run dev` levanta cliente y API; 51 pruebas en verde; bundle 93 KB gzip |
| **2** ✅ | Auth: usuarios, **argon2id**, JWT + **refresh rotativo con detección de reuso**, matriz de permisos, login, siembra del admin | Se entra con usuario y contraseña; 33 pruebas de servidor en verde |
| **3** ✅ | Productos con unidades y decimales, ajustes y mermas con motivo | Se crean productos y se ajustan existencias |
| **4** ✅ | Clientes y proveedores (modelo `Persona` unificado), creación al vuelo | Se crean desde la propia venta, solo con el nombre |
| **5** ✅ | Inventario: movimientos, stock como consecuencia, verificación | El stock solo cambia por movimientos (INV-1 verde) |
| **6** ✅ | Viajes de compra con cargue repartido y costo promedio | 100 bultos a 104.000 + cargue → costo real 114.000 |
| **6b** ✅ | Deuda con proveedores y abonos | La deuda con HIJINIO se ve y se abona |
| **7** ✅ | **Ventas**: pantalla única, contado / fiado / parcial, transacción completa | Venta registrada desde el móvil en una pantalla |
| **8** ✅ | Saldo corriente por cliente y moneda, cuenta con movimientos | Reemplaza la hoja `CLIENTES No. 1` |
| **9** ✅ | Abonos parciales, en otra moneda, con tasa acordada | 300 US$ aplicados a una deuda en bolívares |
| **10** ✅ | Tasa del día: manual, de internet, histórico y snapshot por operación | Cambiar la tasa no altera ninguna venta pasada |
| **11** | Cambio de moneda (§16) con comisión y resultado                                                                        | Operación de cambio registrada y medida                                        |
| **12** ✅ | Gastos fijos y variables con equivalencias | Se anotan y entran en la ganancia del mes |
| **13** ✅ | Inicio completo con selector de moneda | Todo el negocio en COP, USD o VES con un toque |
| **13b** ✅ | **Control de caja**: cajas por moneda, conteo, traslados y cambio de divisa | Responde "¿cuánto dinero tengo?" en las tres monedas |
| **13c** ✅ | **Por días**: registrar con fecha y ver todo lo de cada día con sus totales | Reemplaza las columnas por día de su Excel |
| **14** ✅ | Pruebas de los flujos críticos del negocio | 104 pruebas en verde |
| **15** | Optimización: índices, rendimiento, tamaño del paquete | Presupuestos de `ARCHITECTURE.md §7` cumplidos |
| **16** ✅ | Despliegue: un solo servicio, Dockerfile, blueprint de Render y arranque que se prepara solo | Build de producción probado y funcionando |

### Dependencias entre fases

```
1 ─▶ 2 ─▶ 3 ─▶ 4 ─┬─▶ 5 ─▶ 6 ─┐
                  │           ├─▶ 7 ─▶ 8 ─▶ 9 ─▶ 13 ─▶ 14 ─▶ 15 ─▶ 16 ─▶ 17 ─▶ 18
                  └─▶ 10 ─────┘         ▲
                       └─▶ 11 ─▶ 12 ────┘
```

La fase 10 (tasas) se adelanta parcialmente dentro de la 1: el núcleo de dinero y el snapshot
son requisito de la venta, no un añadido posterior. Sin eso, la fase 7 nacería mal.

---

## 5. Estado actual y qué falta

> ⏸️ **La Fase 1 está EN ESPERA por decisión del negocio (19/08/2026):** no se escribe código
> hasta analizar las fotografías del cuaderno y el documento del proceso (§46, §76).

| Necesito                                                | Estado                                | Bloquea                                           |
| ------------------------------------------------------- | ------------------------------------- | ------------------------------------------------- |
| 📷 **Fotos del cuaderno + documento del proceso** (§46) | ⏳ **Pendiente — bloqueante**         | **Todo el desarrollo**, por decisión expresa      |
| `RP-01` moneda funcional                                | ✅ **COP**                            | —                                                 |
| `RC-30b` mercado VES por defecto                        | ✅ **PARALELO**                       | —                                                 |
| `RC-29` tasa de cobro de deudas viejas                  | ✅ **El usuario elige en cada cobro** | —                                                 |
| Respuestas a `RP-10` … `RP-22`                          | ⏳ Pendientes                         | Nada: todas tienen valor por defecto configurable |
| Lista real de productos, unidades y presentaciones      | ⏳ Pendiente                          | Fase 3 (son datos, no código)                     |

### Qué haré en cuanto lleguen las fotos

1. Leer las hojas sin inventar nada ilegible (§47, §73).
2. Extraer columnas, abreviaturas, cálculos y forma de agrupar.
3. Contrastarlas con este diseño y reportar coincidencias, faltantes y contradicciones.
4. Ajustar el formulario de Nueva Venta al orden mental real del cuaderno.
5. Actualizar `BUSINESS_RULES.md` con las reglas que se descubran.
6. Arrancar la Fase 1.
