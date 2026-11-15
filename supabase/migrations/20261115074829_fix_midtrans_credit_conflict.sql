create or replace function public.apply_midtrans_notification(
  p_order_id text, p_gross_amount integer, p_status text, p_payment_type text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_purchase public.purchases;
  v_balance integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  select * into v_purchase from public.purchases where order_id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_purchase.harga_total <> p_gross_amount then raise exception 'Payment amount mismatch'; end if;
  if v_purchase.status <> 'pending' then return; end if;
  if p_status not in ('paid', 'pending', 'failed', 'expired') then raise exception 'Invalid payment status'; end if;

  update public.purchases
  set status = p_status,
      payment_type = nullif(p_payment_type, ''),
      paid_at = case when p_status = 'paid' then now() else paid_at end
  where id = v_purchase.id;

  if p_status = 'paid' then
    perform 1 from public.buyers where id = v_purchase.buyer_id for update;
    select coalesce(sum(jumlah), 0)::integer into v_balance
    from public.credit_ledger where buyer_id = v_purchase.buyer_id;

    insert into public.credit_ledger (buyer_id, purchase_id, tipe, jumlah, saldo_setelah, keterangan)
    values (
      v_purchase.buyer_id, v_purchase.id, 'masuk', v_purchase.jumlah_kredit_dibeli,
      v_balance + v_purchase.jumlah_kredit_dibeli, 'Beli paket ' || coalesce(v_purchase.package_id, 'kredit')
    )
    on conflict (purchase_id) where tipe = 'masuk' and purchase_id is not null do nothing;
    if found then
      update public.buyers set total_transaksi = total_transaksi + 1 where id = v_purchase.buyer_id;
    end if;
  end if;
end;
$$;
