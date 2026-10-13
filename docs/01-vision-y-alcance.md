# 01 — Visión y alcance

## 1. Contexto

El restaurante necesita una carta digital que los clientes puedan consultar desde su teléfono sin descargar aplicaciones. El local dispone de un **wifi propio**, pero el **PC del punto de venta (POS) no tiene acceso a internet**. Ese PC es modesto (Intel i3-3110M de 2012, 4 GB de RAM, Windows 11 Pro 24H2) y ya ejecuta **AxisPOS**, que es crítico para el negocio y no debe verse afectado.

## 2. Problema

- Las cartas impresas se desactualizan (precios, productos agotados, tasas de cambio que varían).
- Los precios deben mostrarse en varias monedas (p. ej. CUP y USD), y la tasa cambia con frecuencia.
- Hay clientes extranjeros que necesitan la carta en otro idioma (inglés al menos).
- No hay internet en el POS, por lo que las soluciones en la nube no sirven.
- Lo que hay es un Tp-link que sirve una red wifi local



## 3. Visión

> Una carta digital **local, ligera y siempre actualizada**, que el personal edita en segundos desde el PC del POS y que el cliente abre al escanear un QR, en su idioma y su moneda, sin internet.



## 4. Objetivos


| ID    | Objetivo                                                             | Indicador de éxito                                                       |
| ----- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| OBJ-1 | Que el cliente vea la carta en su teléfono escaneando un QR          | Carta cargada en < 2 s en wifi local con un teléfono de gama media       |
| OBJ-2 | Que el personal actualice precios, disponibilidad y tasas fácilmente | Marcar un producto como agotado en ≤ 3 clics; cambiar una tasa en ≤ 30 s |
| OBJ-3 | No afectar a AxisPOS                                                 | `MenuDigital.exe` ≤ 80 MB *RAM y CPU* media < 2 % en reposo              |
| OBJ-4 | Funcionar sin internet                                               | 100 % de funciones operativas con el PC desconectado de internet         |
| OBJ-5 | Multimoneda y multiidioma                                            | es + en desde el inicio, monedas configurables                           |
| OBJ-6 | Instalación y mantenimiento simples                                  | Un único `.exe` + carpeta de datos; actualizar = reemplazar el `.exe`    |




## 5. Usuarios / actores


| Actor                                        | Descripción                                                           | Dónde accede                              |
| -------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------- |
| **Administrador** (dueño/encargado)          | Configura categorías, productos, ofertas, monedas, idiomas, wifi y QR | `/admin` en el PC del POS (Edge modo app) |
| **Personal** (cajero/camarero)               | Cambios rápidos: agotado/disponible, tasas del día                    | `/admin` en el PC del POS                 |
| **Cliente**                                  | Consulta la carta, cambia idioma y moneda                             | `/` desde su teléfono en el wifi local    |
| **Desarrollador** (Jhon Alex / AvanzaInTime) | Desarrolla, compila, instala y actualiza                              | Máquina de desarrollo Windows             |


> **Supuesto:** En la Fase 1 no se distinguen roles Administrador/Personal dentro de la aplicación: quien tiene acceso físico al PC del POS tiene acceso al Admin. Un PIN opcional se contempla como *Should* (ver RF-07).



## 6. Alcance — Fase 1 (incluido)

1. **Servidor local único** (`MenuDigital.exe`) que sirve Carta y Admin.
2. **Admin** (solo localhost):
  - CRUD y ordenación de **categorías** (Entrantes, Plato Fuerte, Cócteles, …).
  - CRUD y ordenación de **productos** de tipo *comida*, *bebida* o *artículo* (cigarros, jabitas de nailon…), con foto, precio base, descripción, disponible/agotado, orden.
  - CRUD de **ofertas/combos** con precio especial y lista de productos incluidos.
  - **Monedas**: moneda base y tasas de cambio editables.
  - **Idiomas**: es + en, posibilidad de añadir más; traducciones por elemento.
  - **Imágenes**: subida con compresión automática.
  - **Red y QR**: configuración del wifi (SSID/contraseña/seguridad), detección de IP, aviso si la IP cambia, tarjeta imprimible con 2 QR.
  - **Copias de seguridad** manuales y automáticas de la base de datos.
3. **Carta** (LAN, solo lectura):
  - Listado por categorías, ofertas destacadas, foto, descripción, precio en la moneda elegida, estado agotado.
  - Selector de idioma (fallback a español) y de moneda.
  - Diseño único creado con IA de diseño e integrado en el código.
4. **Operación**: autoarranque con Windows, datos fuera del `.exe`, actualización por reemplazo del ejecutable.



## 7. Fuera de alcance — Fase 1 (excluido)


| Excluido                                                | Motivo / Fase prevista                                |
| ------------------------------------------------------- | ----------------------------------------------------- |
| Pedidos de clientes desde el teléfono                   | Requiere flujo con cocina/caja e integración; Fase 2+ |
| Ofertas por horario (happy hour, menú del día por hora) | Complejidad de reglas; Fase 2                         |
| Portal cautivo (abrir la carta al conectarse al wifi)   | Depende del router; Fase 2+                           |
| Integración con AxisPOS (sincronizar productos/precios) | No acordado; requiere estudiar AxisPOS                |
| Acceso al Admin desde otros dispositivos (tablet/móvil) | Seguridad: Admin solo localhost en Fase 1             |
| Sistema de plantillas/temas intercambiables             | Decisión explícita (ADR-06)                           |
| Internet, nube, sincronización remota                   | El POS no tiene internet                              |
| Pagos en línea                                          | Fuera del propósito                                   |
| Estadísticas de visitas                                 | *Could*, posible Fase 2                               |




## 8. Restricciones

- **Hardware**: i3-3110M (Ivy Bridge, tiene SSE4.2 y AVX, **no AVX2**), 4 GB RAM compartidos con Windows 11, Edge y AxisPOS.
- **Software**: Windows 11 Pro 24H2 x64, Microsoft Edge (Chromium) preinstalado.
- **Red**: sin internet en el POS; los clientes y el POS comparten la LAN del wifi.
- **Tecnología**: TypeScript + Bun, ejecutable único, SQLite. Sin Tauri/Rust/Electron.
- **Convivencia**: no interferir con AxisPOS (puertos, CPU, RAM, archivos).



## 9. Riesgos principales


| Riesgo                                                                                      | Impacto    | Mitigación                                                                                              |
| ------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| El build de Bun no corre en la CPU sin AVX2                                                 | Bloqueante | Usar target `baseline`; prueba en el POS real en la Fase 0                                              |
| La IP del POS cambia y los QR impresos dejan de funcionar                                   | Alto       | Reserva DHCP en el router + detección de cambio de IP con aviso (RF-33)                                 |
| Consumo de RAM excesivo con 4 GB                                                            | Medio      | Presupuesto de memoria (RNF-02), compresión de imágenes en el cliente, Admin abierto solo cuando se usa |
| Aislamiento de clientes (AP isolation) en el router impide que los teléfonos lleguen al POS | Alto       | Verificar configuración del router en la instalación (ver 09)                                           |
| El Firewall de Windows bloquea el puerto                                                    | Alto       | Regla de entrada en perfil Privado, red marcada como Privada                                            |
| Conflicto de puerto con AxisPOS                                                             | Medio      | Puerto configurable, comprobación al arrancar                                                           |
| Antivirus/SmartScreen bloquea el `.exe` sin firma                                           | Medio      | Desbloquear archivo, exclusión de la carpeta; firma de código opcional                                  |


