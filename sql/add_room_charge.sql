-- add_room_charge: posts a charge (e.g. an F&B order) directly onto an
-- existing folio, with no payment collected — the amount becomes part of
-- what the guest owes on the room bill instead of something collected at
-- the door. Used by "Charge to Room" in KitchenOrdersScreen.jsx.
--
-- Mirrors record_payment()'s conventions: row-locked with `for update`,
-- hard validation before writing, billing_status re-derived from the
-- numbers every time (the same case/when formula record_payment uses),
-- jsonb return. The one real difference: this increases
-- total_amount_due (a new charge) rather than amount_paid (money
-- received) — which is exactly why the same status formula can flip a
-- folio backward from 'paid' to 'partially_paid' when a charge lands on
-- an already-settled room, same as discussed.
--
-- No `payments` row is written here — that table represents actual money
-- collected and generates a receipt/receipt_number, and no money changes
-- hands in a room charge. It does log a `transactions` row (payment_type
-- = 'room_charge') so it still shows up in the audit trail, matching how
-- mark_balance_settled() also logs a transaction for a folio change with
-- no real payment behind it.
--
-- Requires is_fnb_or_admin() (created separately) to already exist.

create or replace function public.add_room_charge(
  p_folio_id uuid,
  p_amount numeric,
  p_note text default null,
  p_processed_by uuid default null,
  p_processed_by_name text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_folio billing_records%rowtype;
  v_reservation_status text;
  v_new_total_due numeric;
  v_new_remaining numeric;
  v_new_status text;
  v_transaction_id uuid;
begin
  if not is_fnb_or_admin() then
    raise exception 'Only F&B or admin staff can charge orders to a room.';
  end if;

  select * into v_folio from billing_records where id = p_folio_id for update;
  if not found then
    raise exception 'Billing record not found.';
  end if;

  if p_amount <= 0 then
    raise exception 'Charge amount must be greater than zero.';
  end if;

  -- Re-check server-side, never trust the UI alone for something that
  -- touches billing: only a currently checked-in guest can have charges
  -- added to their room.
  select status into v_reservation_status from reservations where id = v_folio.reservation_id;
  if v_reservation_status is distinct from 'checked-in' then
    raise exception 'Cannot charge to room — guest is not currently checked in (reservation status: %).', coalesce(v_reservation_status, 'unknown');
  end if;

  v_new_total_due := v_folio.total_amount_due + p_amount;
  v_new_remaining := v_folio.remaining_balance + p_amount;
  v_new_status := case
    when v_folio.amount_paid <= 0 then 'unpaid'
    when v_folio.amount_paid >= v_new_total_due then 'paid'
    else 'partially_paid'
  end;

  update billing_records
  set total_amount_due = v_new_total_due,
      remaining_balance = v_new_remaining,
      billing_status = v_new_status
  where id = p_folio_id;

  insert into transactions (guest_name, reservation_id, payment_type, amount, staff_id, staff_name, status, note)
  values (v_folio.guest_name, v_folio.reservation_id, 'room_charge', p_amount, p_processed_by, p_processed_by_name, 'completed', p_note)
  returning id into v_transaction_id;

  return jsonb_build_object(
    'transactionId', v_transaction_id,
    'newTotalAmountDue', v_new_total_due,
    'newRemainingBalance', v_new_remaining,
    'newStatus', v_new_status
  );
end;
$$;