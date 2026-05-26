-- =============================================================================
-- Reverse sync: when a client's name or phone changes, update all their repairs
-- Keeps reparaciones.cliente_nombre / cliente_telefono in sync with clientes table
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_repairs_on_cliente_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE reparaciones
     SET cliente_nombre    = NEW.nombre,
         cliente_telefono  = NEW.telefono
   WHERE cliente_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_sync_repairs ON public.clientes;

CREATE TRIGGER trg_clientes_sync_repairs
  AFTER UPDATE OF nombre, telefono ON public.clientes
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_repairs_on_cliente_update();
