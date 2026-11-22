<?php
/**
 * PlatePilot theme functions.
 *
 * Self-contained: no build step, no external libraries. Registers the
 * navigation, a "PlatePilot" settings screen where the database and
 * payment-gateway credentials are entered, and shortcodes that read live
 * data through those credentials.
 *
 * How the pieces fit: this theme is the whole website and it talks to the
 * database directly over HTTPS from PHP. That means no application server
 * is required to run the site: a free PHP host plus the database project is
 * enough to publish menus, take table QR traffic and show live prices.
 *
 * The ordering engine (checkout verification, the kitchen display and
 * reports) is a separate Node application. Where it is hosted, its address
 * goes in the settings below and the site links visitors into it. Without
 * it, the site still works as a site: it publishes what the database holds.
 */

if ( ! defined( 'ABSPATH' ) ) exit;

/* The site's copy lives in inc/content.php and the shared FAQ/closing
 * renderers in inc/render.php; both must load before any template runs,
 * otherwise the front end fatals on an undefined function. */
foreach ( array( '/inc/content.php', '/inc/render.php' ) as $platepilot_inc ) {
	$platepilot_path = get_theme_file_path( $platepilot_inc );
	if ( is_readable( $platepilot_path ) ) {
		require $platepilot_path;
	}
}

/* ------------------------------------------------------------------ */
/* Theme setup                                                         */
/* ------------------------------------------------------------------ */

function platepilot_setup() {
	load_theme_textdomain( 'platepilot' );
	add_theme_support( 'title-tag' );
	add_theme_support( 'post-thumbnails' );
	add_theme_support( 'html5', array( 'search-form', 'gallery', 'caption', 'style', 'script' ) );
	register_nav_menus( array(
		'primary' => __( 'Primary navigation', 'platepilot' ),
	) );
}
add_action( 'after_setup_theme', 'platepilot_setup' );

function platepilot_assets() {
	// Version every asset by its own modification time. A fixed version string
	// means a browser keeps the previous stylesheet after a theme update and
	// the site looks broken to the one person who has visited before.
	$style_path = get_theme_file_path( '/style.css' );
	$script_path = get_theme_file_path( '/inc/main.js' );
	$style_version = is_readable( $style_path ) ? (string) filemtime( $style_path ) : '1.0.0';
	$script_version = is_readable( $script_path ) ? (string) filemtime( $script_path ) : '1.0.0';
	wp_enqueue_style( 'platepilot', get_stylesheet_uri(), array(), $style_version );
	// Motion layer: GSAP for scroll reveals, three.js for the hero room.
	// Both come from a CDN so the theme stays dependency-free on disk.
	wp_enqueue_script( 'gsap', 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js', array(), '3.12.5', true );
	wp_enqueue_script( 'gsap-scrolltrigger', 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js', array( 'gsap' ), '3.12.5', true );
	wp_enqueue_script( 'three', 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js', array(), '0.160.0', true );
	wp_enqueue_script( 'platepilot-main', get_theme_file_uri( '/inc/main.js' ), array( 'gsap', 'gsap-scrolltrigger', 'three' ), $script_version, true );
}
add_action( 'wp_enqueue_scripts', 'platepilot_assets' );

/* ------------------------------------------------------------------ */
/* Settings: the keys this site needs                                  */
/* ------------------------------------------------------------------ */

function platepilot_settings_fields() {
	return array(
		'db_url'       => array(
			'label'    => __( 'Supabase project URL', 'platepilot' ),
			'hint'     => __( 'Supabase dashboard → Project Settings → API → Project URL. Paste it with no trailing slash, for example https://abcdefgh.supabase.co', 'platepilot' ),
			'type'     => 'url',
			'required' => true,
		),
		'db_anon_key'  => array(
			'label'    => __( 'Supabase anon public key', 'platepilot' ),
			'hint'     => __( 'Same screen, the key marked anon public. It can only read what your row-level security allows, so it is safe to keep here — and it is never printed on the public site.', 'platepilot' ),
			'type'     => 'text',
			'required' => true,
		),
		'menu_slug'    => array(
			'label'    => __( 'Restaurant slug', 'platepilot' ),
			'hint'     => __( 'The storefront slug of your restaurant in the database, for example la-divine-eden. Used by the [platepilot_menu] shortcode and by the connection test.', 'platepilot' ),
			'type'     => 'text',
			'required' => true,
		),
		'app_url'      => array(
			'label'    => __( 'Ordering app address (optional)', 'platepilot' ),
			'hint'     => __( 'Only if you host the PlatePilot ordering application somewhere: checkout, the kitchen display and the staff dashboard live in that app. Leave it empty and the site still publishes your menu; the ordering buttons simply ask visitors to phone you.', 'platepilot' ),
			'type'     => 'url',
			'required' => false,
		),
		'stripe_publishable' => array( 'label' => __( 'Stripe publishable key', 'platepilot' ), 'hint' => __( 'pk_live_… from your Stripe dashboard. Stored on your own server; never printed on the site.', 'platepilot' ), 'type' => 'text', 'required' => false ),
		'stripe_secret'      => array( 'label' => __( 'Stripe secret key', 'platepilot' ), 'hint' => __( 'sk_live_…. Kept for the connection check; charging happens in the ordering app.', 'platepilot' ), 'type' => 'text', 'required' => false ),
		'paystack_public'    => array( 'label' => __( 'Paystack public key', 'platepilot' ), 'hint' => __( 'pk_live_… from your Paystack dashboard.', 'platepilot' ), 'type' => 'text', 'required' => false ),
		'paystack_secret'    => array( 'label' => __( 'Paystack secret key', 'platepilot' ), 'hint' => __( 'sk_live_….', 'platepilot' ), 'type' => 'text', 'required' => false ),
		'paypal_client_id'   => array( 'label' => __( 'PayPal client ID', 'platepilot' ), 'hint' => __( 'From your PayPal developer app.', 'platepilot' ), 'type' => 'text', 'required' => false ),
		'paypal_secret'      => array( 'label' => __( 'PayPal secret', 'platepilot' ), 'hint' => __( 'From your PayPal developer app.', 'platepilot' ), 'type' => 'text', 'required' => false ),
	);
}

function platepilot_register_settings() {
	foreach ( platepilot_settings_fields() as $key => $field ) {
		register_setting( 'platepilot', 'platepilot_' . $key, array(
			'type'              => 'string',
			'sanitize_callback' => 'sanitize_text_field',
		) );
	}
}
add_action( 'admin_init', 'platepilot_register_settings' );

function platepilot_settings_page() {
	add_menu_page( 'PlatePilot', 'PlatePilot', 'manage_options', 'platepilot', 'platepilot_render_settings', 'dashicons-store' );
}
add_action( 'admin_menu', 'platepilot_settings_page' );

function platepilot_value( $key ) {
	return trim( (string) get_option( 'platepilot_' . $key, '' ) );
}

/**
 * The best URL for a marketing route: the WordPress page that carries it,
 * the app when it is hosted, and the home page as a last resort. Keeps the
 * navigation honest instead of printing links that go nowhere.
 */
function platepilot_link( $slug ) {
	$page = get_page_by_path( sanitize_title( $slug ) );
	if ( $page instanceof WP_Post ) {
		$permalink = get_permalink( $page );
		if ( $permalink ) return $permalink;
	}
	$app_url = untrailingslashit( platepilot_value( 'app_url' ) );
	if ( '' !== $app_url ) return $app_url . '/en/' . $slug;
	return home_url( '/' );
}

/** Where "ask about a plan" goes: the site administrator, obfuscated. */
function platepilot_contact_url() {
	$email = antispambot( get_option( 'admin_email', '' ) );
	return $email ? 'mailto:' . $email : home_url( '/' );
}

/* ------------------------------------------------------------------ */
/* Database access (PostgREST over HTTPS, from PHP)                    */
/* ------------------------------------------------------------------ */

/**
 * One request to the database project's REST interface. The public key
 * travels in a header, server-side: it is never sent to a visitor's
 * browser and never echoed into a page.
 */
function platepilot_db_request( $path, $args = array() ) {
	$db_url = untrailingslashit( platepilot_value( 'db_url' ) );
	$key    = platepilot_value( 'db_anon_key' );
	if ( '' === $db_url || '' === $key ) {
		return new WP_Error( 'platepilot_unconfigured', 'Database credentials are missing.' );
	}
	$request = array(
		'method'  => isset( $args['method'] ) ? $args['method'] : 'GET',
		'headers' => array(
			'apikey'        => $key,
			'Authorization' => 'Bearer ' . $key,
			'Accept'        => 'application/json',
			'Content-Type'  => 'application/json',
		),
		'timeout' => 10,
	);
	if ( isset( $args['body'] ) ) {
		$request['body'] = wp_json_encode( $args['body'] );
	}
	$response = wp_remote_request( $db_url . $path, $request );
	if ( is_wp_error( $response ) ) return $response;
	$code = wp_remote_retrieve_response_code( $response );
	$body = wp_remote_retrieve_body( $response );
	return array( 'code' => (int) $code, 'body' => $body );
}

/**
 * The published menu for a slug, read through the database's public read
 * function. Only published, available items come back.
 *
 * @return array|WP_Error { location: array, items: array }
 */
function platepilot_fetch_menu( $slug, $locale = 'en' ) {
	$slug = sanitize_title( $slug );
	if ( '' === $slug ) return new WP_Error( 'platepilot_no_slug', 'No restaurant slug configured.' );
	$response = platepilot_db_request( '/rest/v1/rpc/public_menu', array(
		'method' => 'POST',
		'body'   => array( 'p_slug' => $slug, 'p_locale' => $locale ),
	) );
	if ( is_wp_error( $response ) ) return $response;
	if ( 404 === $response['code'] ) {
		return new WP_Error( 'platepilot_no_function', 'The database is reachable but the public_menu function is missing. Run kit/supabase-public-menu.sql in the Supabase SQL editor.' );
	}
	if ( $response['code'] < 200 || $response['code'] >= 300 ) {
		return new WP_Error( 'platepilot_bad_status', 'The database answered HTTP ' . $response['code'] . '.' );
	}
	$menu = json_decode( $response['body'], true );
	if ( ! is_array( $menu ) || empty( $menu['items'] ) ) {
		return new WP_Error( 'platepilot_not_published', 'No published menu for that slug yet. Publish the menu in PlatePilot first.' );
	}
	return $menu;
}

/** Money is stored in minor units; print it the way the shop prices it. */
function platepilot_money( $amount_minor, $currency ) {
	$amount = number_format( (float) $amount_minor / 100, 2, '.', ',' );
	return trim( $amount . ' ' . (string) $currency );
}


/* ------------------------------------------------------------------ */
/* Site pages                                                          */
/* ------------------------------------------------------------------ */

/**
 * The pages the navigation points at, and the template each one carries.
 * Slugs match the routes the copy was written for.
 */
function platepilot_page_map() {
	return array(
		'pricing'      => array( 'Pricing', 'template-pricing.php' ),
		'features'     => array( 'Features', 'template-features.php' ),
		'how-it-works' => array( 'How it works', 'template-how-it-works.php' ),
		'integrations' => array( 'Integrations', 'template-integrations.php' ),
		'white-label'  => array( 'White label', 'template-white-label.php' ),
		'about'        => array( 'About', 'template-about.php' ),
		'status'       => array( 'Connection status', 'template-status.php' ),
	);
}

/**
 * Creates any missing page with its template. Idempotent: an existing page
 * with the same slug is left exactly as the site owner left it.
 */
function platepilot_ensure_pages() {
	$created = 0;
	foreach ( platepilot_page_map() as $slug => $page ) {
		if ( get_page_by_path( $slug ) instanceof WP_Post ) continue;
		$page_id = wp_insert_post( array(
			'post_type'     => 'page',
			'post_status'   => 'publish',
			'post_title'    => $page[0],
			'post_name'     => $slug,
			'page_template' => $page[1],
		) );
		if ( $page_id && ! is_wp_error( $page_id ) ) $created++;
	}
	return $created;
}
add_action( 'after_switch_theme', 'platepilot_ensure_pages' );

/** The "create the pages" button on the settings screen. */
function platepilot_handle_create_pages() {
	if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Forbidden' );
	check_admin_referer( 'platepilot_create_pages' );
	$created = platepilot_ensure_pages();
	wp_safe_redirect( add_query_arg( array( 'page' => 'platepilot', 'created' => $created ), admin_url( 'admin.php' ) ) );
	exit;
}
add_action( 'admin_post_platepilot_create_pages', 'platepilot_handle_create_pages' );

/* ------------------------------------------------------------------ */
/* Settings screen                                                     */
/* ------------------------------------------------------------------ */

function platepilot_render_settings() {
	if ( ! current_user_can( 'manage_options' ) ) return;
	$missing = array();
	foreach ( platepilot_settings_fields() as $key => $field ) {
		if ( ! empty( $field['required'] ) && '' === platepilot_value( $key ) ) $missing[] = $field['label'];
	}
	$probe = null;
	if ( ! $missing ) {
		$menu  = platepilot_fetch_menu( platepilot_value( 'menu_slug' ) );
		$probe = is_wp_error( $menu ) ? $menu->get_error_message() : sprintf( 'Connected. %d published items found for “%s”.', count( $menu['items'] ), platepilot_value( 'menu_slug' ) );
	}
	?>
	<div class="wrap">
		<h1>PlatePilot</h1>
		<?php if ( $missing ) : ?>
			<div class="notice notice-warning"><p>
				<?php printf( esc_html( 'Waiting for credentials: %s', 'platepilot' ), esc_html( implode( ', ', $missing ) ) ); ?>
			</p></div>
		<?php elseif ( is_wp_error( platepilot_fetch_menu( platepilot_value( 'menu_slug' ) ) ) ) : ?>
			<div class="notice notice-error"><p><?php echo esc_html( (string) $probe ); ?></p></div>
		<?php else : ?>
			<div class="notice notice-success"><p><?php echo esc_html( (string) $probe ); ?></p></div>
		<?php endif; ?>
		<?php if ( isset( $_GET['created'] ) ) : ?>
			<div class="notice notice-success is-dismissible"><p>
				<?php echo esc_html( sprintf( '%d page(s) created. Visit the site and the menus work.', (int) $_GET['created'] ) ); ?>
			</p></div>
		<?php endif; ?>
		<h2>Site pages</h2>
		<p>
			<?php esc_html_e( 'Creates any missing page with its template: Pricing, Features, How it works, Integrations, White label, About and a private Connection status page.', 'platepilot' ); ?>
		</p>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="margin-bottom:28px">
			<input type="hidden" name="action" value="platepilot_create_pages" />
			<?php wp_nonce_field( 'platepilot_create_pages' ); ?>
			<?php submit_button( 'Create the missing pages', 'secondary', 'submit', false ); ?>
		</form>
		<h2>Credentials</h2>
		<form method="post" action="options.php">
			<?php settings_fields( 'platepilot' ); ?>
			<table class="form-table" role="presentation">
				<?php foreach ( platepilot_settings_fields() as $key => $field ) : ?>
					<tr>
						<th scope="row"><label for="platepilot_<?php echo esc_attr( $key ); ?>"><?php echo esc_html( $field['label'] ); ?></label></th>
						<td>
							<input type="<?php echo esc_attr( $field['type'] ); ?>" id="platepilot_<?php echo esc_attr( $key ); ?>" name="platepilot_<?php echo esc_attr( $key ); ?>" value="<?php echo esc_attr( platepilot_value( $key ) ); ?>" class="regular-text" autocomplete="off" />
							<p class="description"><?php echo esc_html( $field['hint'] ); ?></p>
						</td>
					</tr>
				<?php endforeach; ?>
			</table>
			<?php submit_button(); ?>
		</form>
		<p><em><?php esc_html_e( 'Keys are stored in your own database and are never printed on the public site.', 'platepilot' ); ?></em></p>
	</div>
	<?php
}

/* ------------------------------------------------------------------ */
/* Shortcodes                                                          */
/* ------------------------------------------------------------------ */

/**
 * [platepilot_status] — a private connection check page. Shows what is
 * configured and what is still missing. Values are never echoed.
 */
function platepilot_status_shortcode() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return '<p>' . esc_html__( 'Sign in as an administrator to see the connection status.', 'platepilot' ) . '</p>';
	}
	$rows = '';
	foreach ( platepilot_settings_fields() as $key => $field ) {
		$ok   = '' !== platepilot_value( $key );
		$mark = $ok ? 'configured' : ( ! empty( $field['required'] ) ? 'missing' : 'not set (optional)' );
		$rows .= '<div class="flow-row ' . ( $ok ? 'is-in' : '' ) . '"><strong>' . esc_html( $field['label'] ) . '</strong><span>' . esc_html( $mark ) . '</span></div>';
	}
	$menu  = platepilot_fetch_menu( platepilot_value( 'menu_slug' ) );
	$rows .= '<div class="flow-row ' . ( is_wp_error( $menu ) ? '' : 'is-in' ) . '"><strong>' . esc_html__( 'Live menu read', 'platepilot' ) . '</strong><span>' .
		esc_html( is_wp_error( $menu ) ? $menu->get_error_message() : sprintf( '%d items', count( $menu['items'] ) ) ) . '</span></div>';
	return '<div class="flow-list">' . $rows . '</div>';
}
add_shortcode( 'platepilot_status', 'platepilot_status_shortcode' );

/**
 * [platepilot_menu slug="la-divine-eden"] — the published menu, read live
 * from the database with the stored public key. Read-only: ordering and
 * checkout belong to the ordering app.
 */
function platepilot_menu_shortcode( $atts ) {
	$atts = shortcode_atts( array( 'slug' => '', 'locale' => 'en' ), $atts, 'platepilot_menu' );
	$slug = '' !== $atts['slug'] ? $atts['slug'] : platepilot_value( 'menu_slug' );
	if ( '' === $slug ) {
		return current_user_can( 'manage_options' ) ? '<p><em>' . esc_html__( '[platepilot_menu] needs a slug: add one here, or write [platepilot_menu slug="your-restaurant"].', 'platepilot' ) . '</em></p>' : '';
	}
	$menu = platepilot_fetch_menu( $slug, $atts['locale'] );
	if ( is_wp_error( $menu ) ) {
		return current_user_can( 'manage_options' ) ? '<p><em>' . esc_html( $menu->get_error_message() ) . '</em></p>' : '';
	}
	$location = isset( $menu['location'] ) ? $menu['location'] : array();
	$out  = '<div class="storefront-block">';
	$out .= '<h2>' . esc_html( isset( $location['name'] ) ? $location['name'] : get_bloginfo( 'name' ) ) . '</h2>';
	if ( ! empty( $location['address'] ) ) {
		$out .= '<p class="locations-address">' . esc_html( $location['address'] ) . '</p>';
	}
	$currency = isset( $location['currency'] ) ? $location['currency'] : '';
	$category = null;
	$open     = false;
	foreach ( $menu['items'] as $item ) {
		if ( empty( $item['available'] ) ) continue;
		$item_category = isset( $item['category'] ) ? (string) $item['category'] : '';
		if ( $item_category !== $category ) {
			if ( $open ) $out .= '</ul>';
			$category = $item_category;
			if ( '' !== $category ) $out .= '<h3>' . esc_html( $category ) . '</h3>';
			$out .= '<ul class="storefront-items">';
			$open = true;
		}
		$out .= '<li><span class="storefront-item-name">' . esc_html( $item['name'] );
		if ( ! empty( $item['description'] ) ) {
			$out .= '<small>' . esc_html( $item['description'] ) . '</small>';
		}
		if ( ! empty( $item['allergens'] ) && is_array( $item['allergens'] ) ) {
			$out .= '<small class="storefront-allergens">' . esc_html( implode( ' · ', $item['allergens'] ) ) . '</small>';
		}
		$out .= '</span><span class="storefront-item-price">' . esc_html( platepilot_money( $item['amountMinor'], isset( $item['currency'] ) ? $item['currency'] : $currency ) ) . '</span></li>';
	}
	if ( $open ) $out .= '</ul>';

	$app_url = untrailingslashit( platepilot_value( 'app_url' ) );
	if ( '' !== $app_url ) {
		$out .= '<p><a class="button" href="' . esc_url( $app_url . '/en/r/' . rawurlencode( $slug ) ) . '">' . esc_html__( 'Order online', 'platepilot' ) . '</a></p>';
	}
	$out .= '</div>';
	return $out;
}
add_shortcode( 'platepilot_menu', 'platepilot_menu_shortcode' );
