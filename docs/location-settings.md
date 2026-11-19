# Location settings

Ordering and staff workflows read their configuration from
`locations.service_settings`. The setting is a JSON object owned by the
merchant; nothing in it is inferred from the browser, the timezone of the
device, or the language of the customer.

```jsonc
{
  "taxBasisPoints": 1500,          // 15.00%, integer basis points
  "pricingMode": "tax_exclusive",  // or "tax_inclusive"
  "serviceFeeMinor": 0,            // flat service fee in minor units
  "deliveryFeeMinor": 500,         // flat delivery fee in minor units
  "seatingCapacity": 40,           // seats available for reservations
  "openingHours": {                // 0 = Sunday, matching Date#getDay()
    "1": [["11:30", "15:00"], ["17:00", "22:30"]],
    "2": [["11:30", "22:30"]],
    "3": [["11:30", "22:30"]],
    "4": [["11:30", "22:30"]],
    "5": [["11:30", "23:30"]],
    "6": [["10:00", "23:30"]],
    "0": [["10:00", "20:00"]]
  },
  "serviceArea": {
    "postalCodes": ["SW1A 1AA", "EC1A 1BB"]
  }
}
```

## Rules the server applies

- **Opening hours.** A location without an `openingHours` key has not declared a
  schedule and is treated as open. A location with `openingHours` but no window
  for the current weekday is closed that day. A window whose end is not after
  its start is read as crossing midnight. An immediate order outside the open
  window is refused with `LOCATION_CLOSED`; a scheduled order is refused with
  `SCHEDULE_OUTSIDE_OPENING_HOURS` when its delivery time falls outside every
  window.
- **Tax.** `taxBasisPoints` is applied to the discounted subtotal, rounded half
  up to the minor unit. With `pricingMode: "tax_exclusive"` the tax is added to
  the total. With `"tax_inclusive"` the listed prices already contain the tax,
  so the tax is extracted from the discounted subtotal instead of added.
- **Discounts.** A discount is only ever granted from an active row in
  `promotions`. The client cannot state a discount amount. A promotion that is
  inactive, outside its window, exhausted, or below its minimum subtotal is
  refused rather than silently ignored.
- **Modifiers.** A modifier is priced from the option group attached to the
  ordered item. Selecting a modifier from another item is refused, and each
  option group's own minimum and maximum selection counts are enforced.
- **Service area.** A delivery order's postal code must appear in
  `serviceArea.postalCodes` when that list is present and non-empty. The list is
  matched case-insensitively. A location with no service area configured
  accepts deliveries anywhere, which should be corrected before the location is
  enabled for delivery.
- **Capacity.** `seatingCapacity` bounds the sum of overlapping reservations. If
  it is absent, the capacity of the location's restaurant tables is used
  instead; a location with neither cannot take reservations.

## Money

All amounts are integers in the currency's minor unit. JPY has no minor unit,
KWD has three. The currency is a property of the location and is never
converted automatically. A payment attempt's amount and currency are fixed when
the attempt is created and are not recomputed afterwards.
