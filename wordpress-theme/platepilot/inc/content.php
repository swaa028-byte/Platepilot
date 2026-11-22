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
			'eyebrow'   => 'THE RESTAURANT OPERATING SYSTEM',
			'title'     => 'Service has enough moving parts.',
			'titleAccent' => "Your system shouldn’t.",
			'rotate'    => array( 'take orders', 'run the room', 'get paid' ),
			'lede'      => 'PlatePilot brings ordering, payments, tables and the kitchen into one clear rhythm—so your team can focus on the people in front of them.',
			'primaryCta' => 'Set up your restaurant',
			'secondaryCta' => 'Explore operations',
			'note'      => 'Start with your real data. No demo restaurant required.',
			'strip'     => array( 'One source of truth', 'Five languages, from day one', 'Payments verified server-side' ),
			'modes' => array(
				array( 'Pickup', 'Timed slots, service rules and honest availability, priced from your published menu.' ),
				array( 'Dine-in', 'The classic room, plus QR ordering from the table when you want it.' ),
				array( 'Delivery', 'Your own zones, fees and minimums—kept on your books, not a marketplace’s.' ),
				array( 'Reservations', 'Book real tables from your floor plan, with the room in charge of every seat.' ),
			),
			'steps' => array(
				array( '01', 'Ordering that meets guests anywhere', 'Pickup, delivery, dine-in QR and scheduled orders, priced from your published menu and service rules.' ),
				array( '02', 'A kitchen always in the loop', 'Route items by station, track preparation and create one ticket—even when a provider sends the same event twice.' ),
				array( '03', 'Payments with a paper trail', 'Hosted checkout, authentic webhooks, independent verification and reconciliation that separates payment from fulfillment.' ),
			),
			'tabs' => array(
				array( 'Table QR', 'Ordering that starts at the table', "Ease up your staff. The guest’s phone becomes a till that prices from your published menu, on the server.", array(
					'The table arrives with the scan—no numbers to type',
					'Prices, hours and minimums come from your rules, never the browser',
					'One code per table, so a scan at another restaurant shows nothing',
				) ),
				array( 'Online storefront', 'A storefront that reads like you', 'Menu, hours, zones and availability published from your settings—updated in one place, live everywhere.', array(
					'Scheduled orders only inside your opening hours',
					'Exact minor-unit money in every currency you settle in',
					'One status page per order, shared with the guest',
				) ),
				array( 'Kitchen & POS', 'Tickets that behave during a rush', 'Route by station, track preparation and close the loop at the pass—the kitchen refuses what was never started.', array(
					'One ticket per order, even when a provider sends the same event twice',
					'Stock leaves on service and lands in the day-end report',
					'Split bills, bar tabs and part payments for real rooms',
				) ),
			),
			'integrationsTitle' => 'Connected to the money and the map.',
			'integrationsBody'  => 'Hosted checkout through Stripe, Paystack and PayPal with signature-verified webhooks; place discovery through Google; and SMS alerts through your own gateway account. Nothing is simulated: a payment is verified server-side before it is shown as paid.',
			'integrations'      => array( 'Stripe', 'Paystack', 'PayPal', 'Google', 'SMS' ),
			'faq' => array(
				array( 'How does PlatePilot work?', 'Everything runs online, in the browser. Set up your restaurant once, and the storefront, the kitchen display, the reports and the settings all read the same data. It runs on a hosted Postgres project or on its own embedded database, so it works without an external account.' ),
				array( 'How do I receive orders?', 'On any device with a browser. The kitchen display shows live tickets routed by station, the counter can accept walk-ins, and every order carries a status page you can share with the guest.' ),
				array( 'Which currencies and languages are supported?', 'Twelve currencies with exact minor-unit money and five launch languages, including right-to-left Arabic. Country, language and currency stay independent, so a restaurant can serve in French and settle in CFA franc.' ),
				array( 'How are payments handled?', 'Hosted checkout through Stripe, Paystack or PayPal. Amounts are immutable once authorised, webhooks are signature-verified, and a payment is applied only after independent verification—a browser redirect never marks an order paid.' ),
			),
			'closingTitle' => 'Make space for better service.',
			'closingBody'  => 'Start with your restaurant, your menu and your floor plan. PlatePilot keeps the system empty until your real data arrives.',
			'closingCta'   => 'Begin restaurant setup',
		),
		'pricing' => array(
			'eyebrow' => 'PRICING',
			'title'   => 'Flat pricing. No commission, ever.',
			'lede'    => 'One price per location, every feature included, and not a cent of your order value. Run PlatePilot yourself for nothing, or let us host it for less than the platforms that bill you twice: once a month, then again on every order.',
			'plansTitle' => 'Four ways to run it.',
			'plansBody'  => 'Same software, same features, different amounts of your own time.',
			'priceNote'  => 'Prices in USD, per location per month, excluding tax. No contract, no setup fee, cancel whenever you like.',
			'plans' => array(
				array(
					'name'     => 'Self-hosted',
					'amount'   => '$0',
					'cadence'  => 'forever',
					'badge'    => 'Most control',
					'pitch'    => 'Your website runs on WordPress with this theme, and the ordering app runs wherever you host it. Every feature, no order limit, and the data never leaves your account.',
					'featured' => false,
					'features' => array(
						'Unlimited orders and locations',
						'Every feature, nothing gated',
						'Your own database, your data',
						'Five languages, twelve currencies',
						'Schema and setup guide included',
					),
					'cta'      => 'Start setup',
					'cta_kind' => 'setup',
				),
				array(
					'name'     => 'Managed',
					'amount'   => '$29',
					'cadence'  => 'per location / month',
					'badge'    => 'Most popular',
					'featured' => true,
					'pitch'    => 'We host the app and the database, take the backups and push the updates. You open the dashboard and get on with service.',
					'features' => array(
						'Everything in Self-hosted',
						'Hosted app and hosted database',
						'Nightly backups, one-click restore',
						'Custom domain with SSL',
						'Email support, one business day',
					),
					'cta'      => 'Ask about managed',
					'cta_kind' => 'contact',
				),
				array(
					'name'     => 'Pro',
					'amount'   => '$59',
					'cadence'  => 'per location / month',
					'badge'    => '',
					'pitch'    => 'For restaurants that sell their own brand: the ordering site wears your name, your domain and your languages, with the API open.',
					'features' => array(
						'Everything in Managed',
						'Full white label, our name removed',
						'Custom domain per location',
						'API access and signed webhooks',
						'Priority support, same day',
					),
					'cta'      => 'Ask about Pro',
					'cta_kind' => 'contact',
				),
				array(
					'name'     => 'Multi-site',
					'amount'   => 'Custom',
					'cadence'  => 'groups and franchises',
					'badge'    => '',
					'pitch'    => 'Many rooms, one catalog, one set of reports. We migrate the menu you already run and train the team that will use it.',
					'features' => array(
						'Unlimited locations under one roof',
						'Shared catalog, per-site pricing',
						'Group reporting and tax export',
						'Migration and onboarding included',
						'Named contact and an SLA',
					),
					'cta'      => 'Talk to us',
					'cta_kind' => 'contact',
				),
			),
			'includedTitle' => 'Everything is in every plan',
			'includedBody'  => 'No add-on market, no feature gates. The self-hosted build is the same one we host, so nothing is unlocked by paying more.',
			'included' => array(
				'Unlimited pickup, delivery and dine-in ordering',
				'Menu builder with photos, allergens and price books',
				'Floor planner, table QR and reservations',
				'Kitchen display with station routing',
				'Hosted checkout with Stripe, Paystack or PayPal',
				'Day-end, anti-theft and tax reports',
			),
			'costsTitle' => 'What sits outside the plan',
			'costsBody'  => 'Running a restaurant already costs money. These are the only other bills, and none of them are ours.',
			'costs' => array(
				array( 'Hosting and database', 'A free tier of a Node host plus a free Postgres project is enough to open. Both scale when the orders do; the managed plans simply fold them into one line.' ),
				array( 'Payment processing', 'Your provider’s standard rate, on your own merchant account. Funds settle to you directly and never pass through us.' ),
				array( 'Custom domain', 'Optional, and usually a few dollars a year. Point it and publish.' ),
			),
			'compareTitle' => 'How that compares',
			'compareHosted' => 'Typical hosted platform',
			'comparePlatepilot' => 'PlatePilot',
			'compare' => array(
				array( 'Software fee, one location', '$39 to $79 per month', '$0 self-hosted, $29 managed' ),
				array( 'Commission on your orders', 'Up to 30% on the marketplaces', '0%, on every plan' ),
				array( 'Order cap on the entry tier', 'Often 100 orders a month', 'Unlimited, no counter' ),
				array( 'White label, your own brand', 'Premium add-on, often $299+ a month', 'Included from Pro' ),
				array( 'Where your data lives', 'Their cloud, on their terms', 'Your own database, export any time' ),
				array( 'Languages', 'Varies by plan', 'Five at launch, Arabic included' ),
			),
			'compareNote' => 'The comparison reflects published list prices of comparable hosted ordering platforms, checked November 2026 and excluding tax and add-ons. Those prices move; the one printed above does not.',
			'faqTitle' => 'Pricing questions, answered',
			'faq' => array(
				array( 'Do you take a commission on orders?', 'No. PlatePilot never takes a percentage of an order value, on any plan. You pay the flat fee, and your payment provider charges its own standard rate on your own account.' ),
				array( 'What does self-hosted actually mean?', 'You run the PlatePilot application on a Node host of your choice and point it at your own database project. Nothing about your restaurant passes through us, and the software is yours to keep.' ),
				array( 'Can I move between plans?', 'Yes, in both directions. The data lives in a standard Postgres project, so moving is an export and an import rather than a rebuild. Moving to self-hosted keeps every table, order and report.' ),
				array( 'What happens if I stop paying?', 'The plan stops; the software does not. Move the same database to your own infrastructure and carry on on the self-hosted plan.' ),
				array( 'Are payment fees included in the price?', 'No, and they are not included anywhere. Stripe, Paystack and PayPal charge their standard rate on your merchant account and settle funds to you directly.' ),
				array( 'Is there a free trial?', 'There is something better: the self-hosted plan is free forever, with the same features as the paid plans. Try the real thing on your own menu before you pay anybody.' ),
			),
			'ctaTitle' => 'Start on your real menu.',
			'ctaBody'  => 'The self-hosted plan costs nothing, and the system stays empty until your real data arrives.',
			'cta'      => 'Set up your restaurant',
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
			array( 'locations', 'Find a restaurant' ),
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
