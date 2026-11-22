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
			'title'   => 'Straight pricing, no games.',
			'lede'    => 'PlatePilot is self-hosted software. There is no monthly platform fee and no contract: you run it, you own your data, and your money goes to your payment provider, not to a middleman.',
			'includedTitle' => 'Everything in the box',
			'includedBody'  => 'One download, every feature. There is no free tier to graduate from and nothing to unlock.',
			'included' => array(
				'Unlimited pickup, delivery and dine-in ordering',
				'Menu builder with photos, allergens and price books',
				'Floor planner, table QR and reservations',
				'Kitchen display with station routing',
				'Hosted checkout with Stripe, Paystack or PayPal',
				'Day-end, anti-theft and tax reports',
			),
			'costsTitle' => 'What you actually pay',
			'costsBody'  => 'Running a restaurant already costs money. PlatePilot adds none of its own.',
			'costs' => array(
				array( 'Hosting', 'A small server or a database free tier gets you started. Scale when the orders say so.' ),
				array( 'Payment processing', "Your provider’s standard rate on your own account. Funds settle to you directly." ),
				array( 'Custom domain', 'Optional, and usually a few dollars a year. Point it and publish.' ),
			),
			'compareTitle' => 'How that compares',
			'compareHosted' => 'Hosted ordering platforms',
			'comparePlatepilot' => 'PlatePilot',
			'compare' => array(
				array( 'Monthly software fee', 'Yes, forever', 'None' ),
				array( 'Your data', 'In their cloud, on their terms', 'In your database, exportable any time' ),
				array( 'Your brand on the ordering site', 'Often gated behind premium plans', 'Standard, from day one' ),
				array( 'Contract and lock-in', 'Common', 'None. It runs where you point it' ),
				array( 'Languages', 'Varies', 'Five at launch, including right-to-left Arabic' ),
			),
			'faqTitle' => 'Questions, answered',
			'ctaTitle' => 'Start with your real restaurant.',
			'ctaBody'  => 'Set it up in an afternoon. The system stays empty until your real data arrives.',
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
	return array(
		'product' => array(
			array( 'operations', 'Operations' ),
			array( 'floor-planner', 'Live Floor' ),
			array( 'kitchen', 'Kitchen' ),
			array( 'qr-codes', 'Table codes' ),
			array( 'reports', 'Reports' ),
			array( 'settings', 'Settings' ),
		),
		'resources' => array(
			array( 'locations', 'Find a restaurant' ),
			array( 'security', 'Security' ),
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
