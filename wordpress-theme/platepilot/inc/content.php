<?php
/**
 * All copy for the PlatePilot theme pages, in one place. The strings mirror
 * the translated catalogs of the Node application; WordPress admins can
 * override any of them with translation plugins.
 */

if ( ! defined( 'ABSPATH' ) ) exit;

function platepilot_content() {
	static $content = null;
	if ( null !== $content ) return $content;

	$content = array(
		'home' => array(
			'eyebrow'   => 'ONE PLATFORM, MANY RESTAURANTS',
			'title'     => 'Service is busy.',
			'titleAccent' => 'Your software shouldn’t be.',
			'rotate'    => array( 'take orders', 'run the room', 'get paid' ),
			'lede'      => 'Open your online shop, take orders and get paid. Every restaurant gets its own page, menu and staff — all on one platform.',
			'primaryCta' => 'Open your shop',
			'secondaryCta' => 'See the restaurants',
			'note'      => 'Free to open. Use your real menu, no demo needed.',
			'strip'     => array( 'Every restaurant its own page', 'Five languages', 'Payments checked by the server' ),
			'modes' => array(
				array( 'Pickup', 'Guests choose a time. Prices come from your menu.' ),
				array( 'Dine-in', 'Serve the room as usual, or let guests order from the table.' ),
				array( 'Delivery', 'Your zones, your fees, your minimums. No marketplace cut.' ),
				array( 'Reservations', 'Book from your own floor plan. You keep every seat.' ),
			),
			'vendorTitle' => 'Your shop, your name.',
			'vendorBody'  => 'Every restaurant on the platform gets its own page, its own menu, its own prices and its own staff. Guests order from you, not from us.',
			'vendorPoints' => array(
				array( 'Your page', 'A storefront at your own address, with your photos and your hours.' ),
				array( 'Your prices', 'You set the menu and the delivery zones. Nobody else can change them.' ),
				array( 'Your staff', 'Add managers, kitchen, hosts and drivers. Each sees only your restaurant.' ),
			),
			'steps' => array(
				array( '01', 'Orders from everywhere', 'Pickup, delivery, table QR and scheduled orders. All priced from your menu and your opening hours.' ),
				array( '02', 'A kitchen that keeps up', 'Each item goes to its station. One ticket per order, even when a payment provider sends the same message twice.' ),
				array( '03', 'Payments you can trace', 'Guests pay by card. We confirm the payment on the server before the order counts.' ),
			),
			'tabs' => array(
				array( 'Table QR', 'Order from the table', 'Guests scan and order. No app to download, no waiting for staff.', array(
					'The table is known from the code',
					'Prices come from your menu, never the browser',
					'One code per table, so another restaurant’s code shows nothing',
				) ),
				array( 'Online storefront', 'A menu that looks like you', 'Your menu, opening hours and delivery zones on one page.', array(
					'Orders only inside your opening hours',
					'Prices in the currency you settle in',
					'A status page for every order',
				) ),
				array( 'Kitchen & POS', 'Tickets that survive a rush', 'Send each item to its station and close it at the pass.', array(
					'One ticket per order',
					'Stock goes down when you serve',
					'Split bills and bar tabs',
				) ),
			),
			'integrationsTitle' => 'Card payments, maps and texts.',
			'integrationsBody'  => 'Card payments through Stripe, Paystack or PayPal. Address lookup through Google. Texts through your own SMS account. Each restaurant connects its own accounts, and a payment is checked on the server before an order is marked paid.',
			'integrations'      => array( 'Stripe', 'Paystack', 'PayPal', 'Google', 'SMS' ),
			'faq' => array(
				array( 'How does it work?', 'Everything runs in the browser. Set up your restaurant once, and the website, the kitchen screen, the reports and the settings all use the same data.' ),
				array( 'How do I get orders?', 'On any device with a browser. The kitchen screen shows live tickets by station, and every order has a status page you can send to the guest.' ),
				array( 'Which currencies and languages?', 'Twelve currencies and five languages, Arabic included. You can serve in French and get paid in CFA franc.' ),
				array( 'How are payments handled?', 'Guests pay by card through Stripe, Paystack or PayPal. The payment is verified on the server before the order is marked paid.' ),
			),
			'closingTitle' => 'Make room for better service.',
			'closingBody'  => 'Start with your restaurant, your menu and your floor plan. Nothing is filled in for you.',
			'closingCta'   => 'Start setup',
		),
		
		'pricing' => array(
			'eyebrow' => 'PRICING',
			'title'   => 'One flat price. No commission.',
			'lede'    => 'Pay per location, use every feature, and keep all of your order money. We never take a cut.',
			'plansTitle' => 'Four ways to run it.',
			'plansBody'  => 'Same software for every restaurant. You choose how much to look after yourself.',
			'priceNote'  => 'USD per location, per month. No contract and no setup fee. Cancel any time. Selling on a platform someone else runs? They can charge a commission instead; ours is 0%.',
			'plans' => array(
				array(
					'name'     => 'Self-hosted',
					'amount'   => '$0',
					'cadence'  => 'forever',
					'badge'    => 'Most control',
					'pitch'    => 'Run it yourself. Your website on WordPress, your data in your own database.',
					'features' => array(
						'200 orders a month, one location',
						'Every feature for one restaurant',
						'Your data stays yours',
						'Two languages, twelve currencies',
						'Setup guide included',
					),
					'cta'      => 'Start setup',
					'cta_kind' => 'setup',
					'featured' => false,
				),
				array(
					'name'     => 'Managed',
					'amount'   => '$29',
					'cadence'  => 'per location / month',
					'badge'    => 'Most popular',
					'featured' => true,
					'pitch'    => 'We host the app and the database, and keep it up to date. You just use it.',
					'features' => array(
						'Unlimited orders',
						'All five languages',
						'Everything in Self-hosted',
						'We host the app and database',
						'Nightly backups',
						'Custom domain with SSL',
						'Email support next business day',
					),
					'cta'      => 'Ask about managed',
					'cta_kind' => 'contact',
				),
				array(
					'name'     => 'Pro',
					'amount'   => '$59',
					'cadence'  => 'per location / month',
					'badge'    => '',
					'featured' => false,
					'pitch'    => 'Your name everywhere, your own domain, and an API for your other tools.',
					'features' => array(
						'Everything in Managed',
						'Full white label',
						'Unlimited orders and languages',
						'Custom domain per location',
						'API and webhooks',
						'Same-day support',
					),
					'cta'      => 'Ask about Pro',
					'cta_kind' => 'contact',
				),
				array(
					'name'     => 'Multi-site',
					'amount'   => 'Custom',
					'cadence'  => 'groups and franchises',
					'badge'    => '',
					'featured' => false,
					'pitch'    => 'Many locations, one menu and one set of reports. We move your menu for you.',
					'features' => array(
						'Unlimited locations',
						'Shared menu, per-location prices',
						'Group reports and tax export',
						'We move your menu for you',
						'A named contact',
					),
					'cta'      => 'Talk to us',
					'cta_kind' => 'contact',
				),
			),
			'includedTitle' => 'Everything is in every plan',
			'includedBody'  => 'No add-ons. The free plan runs the same software as the paid ones: 200 orders a month, two languages, one location.',
			'included' => array(
				'Pickup, delivery and dine-in orders',
				'Menu with photos, allergens and prices',
				'Floor plan, table QR and reservations',
				'Kitchen screen with station routing',
				'Card payments through Stripe, Paystack or PayPal',
				'Daily, takings and tax reports',
			),
			'costsTitle' => 'What the plan does not cover',
			'costsBody'  => 'Only these, and none of them are ours.',
			'costs' => array(
				array( 'Hosting and database', 'Free plans are enough to open. They grow when your orders do; the managed plan puts them on one bill.' ),
				array( 'Card fees', 'Your payment provider’s usual rate, on your own account. The money goes straight to you.' ),
				array( 'Your domain', 'Optional, and usually a few dollars a year.' ),
			),
			'compareTitle' => 'How that compares',
			'compareHosted' => 'Typical hosted platform',
			'comparePlatepilot' => 'PlatePilot',
			'compare' => array(
				array( 'Monthly fee, one location', '$39 to $79', '$0, or $29 managed' ),
				array( 'Commission on orders', 'Up to 30%', '0%, every plan' ),
				array( 'Order limit', '200 a month', 'Unlimited' ),
				array( 'Your own brand', 'Paid add-on, $299+' , 'Included from Pro' ),
				array( 'Your data', 'Their cloud', 'Your database' ),
				array( 'Languages', 'Two', 'All five' ),
			),
			'compareNote' => 'Prices of other platforms taken from their public price lists in November 2026, before tax and add-ons. Ours is the number above.',
			'faqTitle' => 'Pricing questions',
			'faq' => array(
				array( 'Do you take a commission?', 'No. Never, on any plan. You pay the flat fee, and your card provider charges its usual rate on your own account.' ),
				array( 'What does self-hosted mean?', 'You run the app on your own hosting, with your own database. We never see your restaurant data.' ),
				array( 'Can I change plan?', 'Yes, either way. Your data stays in a standard database, so moving is an export and an import, not a rebuild.' ),
				array( 'What if I stop paying?', 'The plan stops. The software does not. Move the same database to your own hosting and carry on free.' ),
				array( 'Are card fees included?', 'No, and they are not included anywhere. Your provider charges its rate on your account and settles to you directly.' ),
				array( 'Is there a free trial?', 'Better than a trial: the free plan lasts forever and has the same features as the paid ones.' ),
			),
			'ctaTitle' => 'Start on your real menu.',
			'ctaBody'  => 'The free plan costs nothing, and nothing is filled in until your real data arrives.',
			'cta'      => 'Start setup',
		),
		'features' => array(
			'eyebrow' => 'FEATURES',
			'title'   => "Everything a service needs. Nothing it doesn’t.",
			'lede'    => 'One system carries the whole day: the menu your guests order from, the room your team reads, the kitchen that cooks it, and the money trail behind all of it.',
			'modesTitle' => 'One system that does it all.',
			'modesBody'  => 'Pickup, delivery, dine-in and reservations run on the same menu, the same money and the same kitchen.',
			'coreTitle' => 'Less switching. More serving.',
			'coreBody'  => 'Each handoff stays visible, accountable and connected to the same order—without making your team learn a dozen different tools.',
			'core' => array(
				array( 'Ordering that meets guests anywhere', 'Pickup, delivery, dine-in QR and scheduled orders, priced from your published menu and service rules.' ),
				array( 'A kitchen always in the loop', 'Route items by station, track preparation and create one ticket—even when a provider sends the same event twice.' ),
				array( 'Payments with a paper trail', 'Hosted checkout, authentic webhooks, independent verification and reconciliation that separates payment from fulfillment.' ),
				array( 'A floor plan that does work', 'Plan in accessible 2D, then opt into 3D. The same table drives reservations, QR sessions and open checks.' ),
			),
			'boxTitle' => 'All in the box',
			'boxBody'  => 'No add-on market, no feature gates. These ship with the product.',
			'box' => array(
				'Scheduled orders', 'Menu photos and allergens', 'Price books per channel', 'Split bills and bar tabs',
				'Stock counts and suppliers', 'Loyalty and campaigns', 'SMS and email campaigns', 'Custom domains',
				'Twelve currencies', 'Five languages, Arabic included', 'Day-end and anti-theft reports', 'Tax export',
			),
			'ctaTitle' => 'See it with your own menu.',
			'ctaBody'  => 'Setup is a wizard, not a project. Your first storefront can be live today.',
			'cta'      => 'Set up your restaurant',
		),
		'how' => array(
			'eyebrow' => 'HOW IT WORKS',
			'title'   => 'A seamless journey, from empty system to first order.',
			'lede'    => 'Six steps to set up, five taps for a guest to order. Every hand-off stays connected to the same order.',
			'setupTitle' => 'One setup that does it all',
			'setupBody'  => 'Everything is configured once, in one place, and every surface reads the same data.',
			'steps' => array(
				array( 'Create your account', 'Sign in with one email. No credit card, no trial clock.' ),
				array( 'Create your restaurant', 'Name, address, currency and language. The wizard walks you through it.' ),
				array( 'Build your menu', 'Dishes, prices, photos and allergens. Type it or upload a CSV.' ),
				array( 'Set your service rules', 'Opening hours, delivery zones and fees, table capacity, taxes.' ),
				array( 'Publish your storefront', 'Your ordering site goes live on your domain, in five languages.' ),
				array( 'Take orders', 'Pickup, delivery and table QR all land in the same kitchen.' ),
			),
			'guestTitle' => 'What your guest sees',
			'guestBody'  => 'No app to install, no account to create. The order just flows.',
			'guest' => array( 'Chooses how to order', 'Adds dishes from your live menu', 'Pays through hosted checkout', 'Tracks the order on its status page', 'Eats' ),
			'flowTitle' => 'How orders move in and out',
			'flowBody'  => 'Nothing in this chain is manual or ambiguous. The same order object travels end to end.',
			'flows' => array(
				array( 'in', 'In: the order arrives from the web, a QR session or the counter' ),
				array( 'in', 'Priced by the server: rules, zones and taxes applied server-side' ),
				array( 'out', 'Out: a ticket reaches the kitchen screen, routed by station' ),
				array( 'in', 'In: the payment provider confirms by signed webhook' ),
				array( 'in', 'Verified: the payment is applied only after independent checks' ),
				array( 'out', 'Out: the guest’s status page updates, and the day-end report collects it' ),
			),
			'faqTitle' => 'Questions, answered',
			'ctaTitle' => 'Start the journey.',
			'ctaBody'  => 'The first step takes a minute. The rest follows your menu.',
			'cta'      => 'Set up your restaurant',
		),
		'integrations' => array(
			'eyebrow' => 'INTEGRATIONS',
			'title'   => 'Connected to the services you already run.',
			'lede'    => 'PlatePilot integrates where money and messages move, and stays honest about every connection: a payment is verified before it is shown as paid.',
			'groups' => array(
				array( 'Payments', 'Hosted checkout on your own merchant accounts. Signed webhooks are verified, amounts are immutable once authorised, and nothing marks an order paid on a redirect alone.', array( 'Stripe', 'Paystack', 'PayPal' ) ),
				array( 'Discovery', 'Find your restaurant without typing an address, and prove the place is yours without handing over an API key to the page that shows it.', array( 'Google Places' ) ),
				array( 'Messages', 'Reach your guests through your own accounts: order and booking confirmations by email, campaigns by SMS through your gateway credentials.', array( 'Email (SMTP)', 'SMS gateway' ) ),
				array( 'Data', 'Run on a hosted Postgres you control or on the embedded database that ships with the app. Same schema, same behaviour, no vendor lock-in.', array( 'Hosted Postgres', 'Embedded database' ) ),
				array( 'Your brand', 'Publish under your own domain with your own identity. Nothing on the guest’s screen says PlatePilot.', array( 'Custom domains', 'Storefront & menus' ) ),
			),
			'docsNote' => 'Machine-readable documentation ships with every install, so search engines and assistants can read your menus directly.',
			'ctaTitle' => 'Connect yours.',
			'ctaBody'  => 'Keys live in your settings, on your server. No third party holds them.',
			'cta'      => 'Explore operations',
		),
		'whitelabel' => array(
			'eyebrow' => 'WHITE LABEL',
			'title'   => 'Your brand, end to end.',
			'lede'    => 'The ordering site, the menus, the emails and the domain all wear your restaurant’s name. The platform stays invisible to your guests.',
			'points' => array(
				array( 'Your domain', 'Add your own domain in settings, verify it, and your storefront publishes there. Certificates handled by your hosting.' ),
				array( 'Your identity', 'Your name, address and photos on every page the guest sees. Orders come from your restaurant, not from a marketplace.' ),
				array( 'Your hardware', 'Any browser device works: a laptop at the counter, a tablet in the kitchen, a phone in your pocket. No locked-in terminals.' ),
				array( 'Your languages', 'Five launch languages including right-to-left Arabic, per guest. One restaurant, five audiences.' ),
			),
			'trustTitle' => 'The quiet checks behind every busy service.',
			'trustBody'  => 'Tenant isolation, least-privilege access, immutable payment amounts and durable event processing are built into the workflow. Google discovery never proves ownership, and a browser redirect never marks an order paid.',
			'trust' => array( 'One source of truth', 'Five languages, from day one', 'Payments verified server-side' ),
			'ctaTitle' => 'Put your name on it.',
			'ctaBody'  => 'Custom domains are part of the standard setup, not a premium tier.',
			'cta'      => 'Set up your restaurant',
		),
		'about' => array(
			'eyebrow' => 'ABOUT',
			'title'   => 'A restaurant operating system, built in the open.',
			'lede'    => 'PlatePilot exists because restaurants deserve software they can own: no platform fee between them and their guests, no lock-in, no mystery about where the data lives.',
			'whatTitle' => 'What PlatePilot is',
			'whatBody'  => 'A complete restaurant platform: ordering for pickup, delivery and dine-in, table QR, reservations, a floor planner in 2D and 3D, a kitchen display, hosted payments with verified webhooks, and the reports that close the day. Self-hosted or on your own hosted database.',
			'beliefTitle' => 'What we believe',
			'beliefs' => array(
				'Empty means empty: the system shows your data or nothing at all.',
				'A payment is paid when it is verified, not when a browser redirects.',
				'Accessibility is part of the product: the floor stays usable in 2D, with a keyboard.',
				'Your guests belong to you, in your database, in your language.',
			),
			'contactTitle' => 'Get in touch',
			'contactBody'  => 'Questions, hosting help or a walkthrough of the security model: write to the project team and you will hear back from the people who build it.',
			'contactCta'   => 'Email the team',
			'contactEmail' => 'team@platepilot.local',
			'securityCta'  => 'Read the security model',
		),
	);

/* ------------------------------------------------------------------ */
/* App feature pages                                                   */
/* One content shape, rendered by template-detail.php. Every sentence  */
/* describes something the shipped software does.                      */
/* ------------------------------------------------------------------ */
$content['operations'] = array(
	'eyebrow'  => 'OPERATIONS',
	'title'    => 'Every order on one board.',
	'lede'     => 'New, preparing, ready, served. Staff see the same board from any screen, and nothing is typed twice.',
	'sections' => array(
		array( 'The board', 'Orders arrive by themselves, from the storefront, a table code or the counter. Moving an order is one tap, and the guest is told at each step.', array( 'Colour and time on every ticket', 'Filter by service: pickup, delivery, dine-in', 'A sound when a new order lands' ) ),
		array( 'Who did what', 'Every change records the person and the time. When money goes missing it is a list, not an argument.', array( 'Staff accounts with roles', 'Void, refund and discount reasons', 'Day-end and anti-theft reports' ) ),
	),
	'cards'    => array(
		array( 'One board, every screen', 'The kitchen, the counter and the phone show the same state. Nothing waits to be synced by hand.' ),
		array( 'Opening hours that hold', 'Orders outside your hours are refused by the server, not by a note on the door.' ),
		array( 'Built for a busy night', 'The order is priced and stored before the guest sees a payment screen, so a crash never loses a ticket.' ),
	),
);

$content['kitchen'] = array(
	'eyebrow'  => 'KITCHEN DISPLAY',
	'title'    => 'The ticket the kitchen asked for.',
	'lede'     => 'Large type, one screen, and the station it belongs to. No printer, no paper, no shouting.',
	'sections' => array(
		array( 'Routed to the right station', 'Each item carries the station that makes it, so the grill sees the grill.', array( 'Per-station views', 'Modifiers shown with the item, always', 'Allergens called out' ) ),
		array( 'Time you can see', 'Every ticket carries its age. Old tickets rise to the top before a guest has to ask.', array( 'Age on every ticket', 'Bump a ticket when it leaves', 'Ready orders move to the counter by themselves' ) ),
	),
	'cards'    => array(
		array( 'Runs on what you have', 'A tablet on the wall or the screen behind the pass. No driver to install.' ),
		array( 'Readable across a kitchen', 'Type sized to be read at arm’s length, in gloves.' ),
		array( 'Stays honest', 'A ticket cannot be marked ready from a device that is not signed in.' ),
	),
);

$content['qr-codes'] = array(
	'eyebrow'  => 'TABLE QR CODES',
	'title'    => 'The table knows itself.',
	'lede'     => 'One code per table. The guest scans, the menu opens, and the order arrives with the table already on it.',
	'sections' => array(
		array( 'Print the sheet', 'Choose your tables, print the sheet, put the codes down. The code carries the table for good.', array( 'One printable sheet per location', 'Table name on every order', 'Dine-in orders priced by the server' ) ),
		array( 'In the guest’s language', 'The menu opens in the language the guest reads, and prices in your currency.', array( 'Five languages', 'Right-to-left Arabic', 'Prices in the currency you set' ) ),
	),
	'cards'    => array(
		array( 'No app to install', 'The code opens the browser. Nothing is downloaded to order a coffee.' ),
		array( 'No table swapping', 'Staff move a table in one tap, and the ticket follows the guest.' ),
		array( 'Anti-theft by design', 'Every table order is recorded against a table and a server.' ),
	),
);

$content['floor-planner'] = array(
	'eyebrow'  => 'FLOOR PLANNER',
	'title'    => 'The room, as it is tonight.',
	'lede'     => 'Tables, seats and areas laid out once, then used by the table codes, the reservations and the anti-theft report.',
	'sections' => array(
		array( 'Lay it out once', 'Place tables and keep the arrangement. It is the same room every service, not a new drawing.', array( 'Areas and table numbers', 'Seat counts per table', 'Saved per location' ) ),
		array( 'One source of truth', 'The floor plan is what the table codes and the reservations read from.', array( 'Table codes generated from the plan', 'Reservations checked against real tables', 'Moves recorded against a server' ) ),
	),
	'cards'    => array(
		array( 'Change it in a minute', 'A table added for a party is placed once and works immediately.' ),
		array( 'For staff, not for show', 'Built for speed during service, on a phone behind the bar.' ),
		array( 'Nothing to install', 'Opens in the browser that is already on the counter.' ),
	),
);

$content['security'] = array(
	'eyebrow'  => 'SECURITY AND PAYMENTS',
	'title'    => 'The price comes from your server.',
	'lede'     => 'A browser can ask for an order. It cannot decide what the order costs.',
	'sections' => array(
		array( 'Pricing is never trusted from the browser', 'Every total is calculated again on the server from your published prices. A tampered request is refused, not discounted.', array( 'Server-side price calculation', 'Stripe, Paystack or PayPal, confirmed by webhook', 'Refunds recorded against the order' ) ),
		array( 'Keys stay on the server', 'Payment keys are held server-side and referenced, never printed into a page.', array( 'Keys never reach the browser', 'Webhooks verified before an order is marked paid', 'Card data never touches PlatePilot' ) ),
		array( 'Every restaurant is walled off', 'Each restaurant reads only its own rows. The database enforces it, not the screens.', array( 'Row-level access rules per restaurant', 'Platform reports kept separate from vendor data', 'Staff actions recorded with a name and a time' ) ),
	),
	'cards'    => array(
		array( 'Card data stays with the provider', 'Stripe and Paystack handle the card. We receive a result, not a card number.' ),
		array( 'Payments you can switch', 'Stripe, Paystack and PayPal are wired the same way, so changing provider is not a rewrite.' ),
		array( 'Data you can leave with', 'Your orders, menu and customers export as CSV and as tax figures.' ),
	),
);

$content['locations'] = array(
	'eyebrow'  => 'RESTAURANT PAGES',
	'title'    => 'Every restaurant, its own address.',
	'lede'     => 'One platform, many restaurants. Each one has its own page, its own prices and its own name on the door.',
	'sections' => array(
		array( 'What a guest sees', 'A menu with photos, allergens and prices, opening hours, and the ways to order.', array( 'Its own page on your domain', 'Menu in five languages', 'Pickup, delivery and dine-in' ) ),
		array( 'How guests arrive', 'A link you share, a code on the table, or a search for the restaurant name.', array( 'A short link per restaurant', 'Table codes that open the menu', 'Search-friendly menu pages' ) ),
	),
	'cards'    => array(
		array( 'Reads like the restaurant', 'Its name, its colours, its food. Not a marketplace with somebody else’s logo on top.' ),
		array( 'One database, separate books', 'Restaurant A can never read restaurant B’s orders, by construction.' ),
		array( 'Open your own shop', 'Any restaurant can publish a page and start taking orders the same day.' ),
	),
);

$content['reports'] = array(
	'eyebrow'  => 'REPORTS',
	'title'    => 'The numbers after service.',
	'lede'     => 'Takings by service, what was refunded, what was voided and who did it. Ready before the till is counted.',
	'sections' => array(
		array( 'Day end', 'One page per day: gross, refunds, tips, tax and what is left.', array( 'Takings by service', 'Refunds and voids listed with reasons', 'Tax figures ready to export' ) ),
		array( 'Anti-theft', 'Orders that were voided, discounted or refunded, with the person and the time.', array( 'Voids and discounts by staff member', 'Orders closed without payment', 'A weekly summary by email' ) ),
		array( 'Marketplace settlement', 'If you run a multi-restaurant platform, the platform sees gross and commission per restaurant, per currency.', array( 'Commission per restaurant', 'Fees recorded only on money actually collected', 'Per-currency totals' ) ),
	),
	'cards'    => array(
		array( 'Numbers you can defend', 'Every figure traces back to an order a guest placed.' ),
		array( 'Cash and card together', 'A cash order that was never paid carries no commission.' ),
		array( 'Export without a spreadsheet', 'CSV for accounting, and a tax summary per period.' ),
	),
);

	return $content;
}

/** Shared nav + footer link data. */
function platepilot_nav() {
	// Grouped the way the product is actually bought and learned: what it does,
	// what it costs, then the context. Every entry resolves through
	// platepilot_link() to the WordPress page, the app, or home.
	return array(
		'product' => array(
			array( 'features', 'All features' ),
			array( 'how-it-works', 'How it works' ),
			array( 'pricing', 'Pricing' ),
			array( 'integrations', 'Integrations' ),
			array( 'white-label', 'White label' ),
			array( 'operations', 'Operations dashboard' ),
			array( 'kitchen', 'Kitchen display' ),
			array( 'qr-codes', 'Table QR codes' ),
			array( 'floor-planner', 'Live floor planner' ),
		),
		'resources' => array(
			array( 'about', 'About PlatePilot' ),
			array( 'security', 'Security and payments' ),
			array( 'locations', 'Restaurant pages' ),
			array( 'reports', 'Reports' ),
		),
	);
}

function platepilot_footer_columns() {
	$app_url = untrailingslashit( platepilot_value( 'app_url' ) );
	return array(
		'Ordering system' => array(
			array( $app_url ? $app_url . '/en/locations' : '', 'Pickup' ),
			array( $app_url ? $app_url . '/en/locations' : '', 'Delivery' ),
			array( $app_url ? $app_url . '/en/features' : '/features', 'Dine-in' ),
			array( $app_url ? $app_url . '/en/features' : '/features', 'Reservations' ),
		),
		'Product' => array(
			array( '/features', 'Features' ),
			array( '/pricing', 'Pricing' ),
			array( '/how-it-works', 'How it works' ),
			array( '/integrations', 'Integrations' ),
			array( '/white-label', 'White label' ),
		),
		'Support' => array(
			array( '/about', 'About' ),
			array( '/about#contact', 'Contact' ),
			array( $app_url ? $app_url . '/en/security' : '', 'Security model' ),
			array( $app_url ? $app_url . '/en/login' : '', 'Staff sign in' ),
		),
	);
}
