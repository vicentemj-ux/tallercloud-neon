# Configuración Cámara Hikvision — TallerCloud

## Datos del dispositivo

| Campo | Valor |
|---|---|
| Modelo | DS-2DE2C400IG-W-W |
| IP | 192.168.1.127 |
| Puerto HTTP | 80 |
| Puerto RTSP | 554 |
| MAC | ac-1c-26-2b-21-e7 |
| Usuario | admin |
| Contraseña | FLNVKY |
| Serial | DS-2DE2C400IG-W-W0120250818CCRRBG2124776 |
| Firmware | V5.3.8 build 241123 |

---

## Configuración del webhook (Alarm Server)

### 1. Acceder al panel web de la cámara
Abre en tu navegador (desde una PC en la misma red):
```
http://192.168.1.127
```
Inicia sesión con:
- Usuario: `admin`
- Contraseña: `FLNVKY`

### 2. Obtener tu URL única de webhook
Ve a **TallerCloud → Configuración → Hardware → Cámara IP Hikvision**.

Copia la URL que aparece en azul, se ve así:
```
https://tallercloud.net/api/alarms/hikvision/TU-TALLER-ID
```

**IMPORTANTE**: Cada taller tiene su propia URL única. No compartas esta URL.

### 3. Configurar detección IVS
1. Ve a **Configuración → Eventos → IVS (Intelligent Video System)**
2. Activa **Line Crossing Detection** (o la que prefieras: Intrusion, Region Entrance)
3. Dibuja la línea/zona justo en la puerta de entrada del negocio
4. En **Trigger Actions**, activa:
   - [x] Notify Surveillance Center
   - [x] Send to HTTP/HTTPS Server

### 4. Configurar Alarm Server (HTTP Host)
1. Ve a **Configuración → Red → Alarm Server** (o **Platform Access → HTTP Host**)
2. Agrega un nuevo HTTP Host:
   - **URL**: `https://tallercloud.net/api/alarms/hikvision/TU-TALLER-ID`
   - **Method**: POST
   - **Content-Type**: application/xml
3. Guarda y aplica.

### 5. Verificar que la cámara puede llegar a internet
Desde el panel web de la cámara, revisa:
- **Configuración → Red → TCP/IP** → el gateway debe ser `192.168.1.254`
- **Configuración → Red → DNS** → debe tener DNS público (8.8.8.8 o el de tu ISP)

### 6. Probar desde TallerCloud
1. Abre TallerCloud (web o desktop)
2. Ve a **Configuración → Hardware**
3. Activa "Cámara IP Hikvision"
4. Completa los datos:
   - IP: `192.168.1.127`
   - Puerto: `80`
   - Usuario: `admin`
   - Contraseña: `FLNVKY`
   - Canal: `101`
5. Presiona **Probar conexión**
6. Si ves la foto de la cámara, todo está listo.

---

## URLs útiles de la cámara

| Propósito | URL |
|---|---|
| Panel web | `http://192.168.1.127` |
| Snapshot ISAPI | `http://192.168.1.127/ISAPI/Streaming/channels/101/picture` |
| RTSP principal | `rtsp://admin:FLNVKY@192.168.1.127:554/Streaming/Channels/101` |
| RTSP substream | `rtsp://admin:FLNVKY@192.168.1.127:554/Streaming/Channels/102` |

---

## Solución de problemas

**"No se pudo conectar a la cámara" desde TallerCloud**
- Verifica que la PC con TallerCloud esté en la misma red (WiFi/cable del negocio)
- Prueba abrir `http://192.168.1.127` en el navegador de esa PC
- Si no carga, la cámara cambió de IP (revisa el SADP Tool de Hikvision)

**La cámara no envía webhooks**
- Revisa en el panel web: **Estado → Logs → Alarm** para ver si disparó eventos
- Verifica que el gateway/DNS esté configurado para que la cámara tenga salida a internet
- Asegúrate de haber copiado la URL completa incluyendo el `tallerId` al final

**La foto sale en negro o muy oscura**
- Ajusta iluminación/IR en **Configuración → Imagen → IR/Illumination**
- La cámara tiene IR nocturno; si la puerta tiene luz natural de día, apaga el IR forzado
