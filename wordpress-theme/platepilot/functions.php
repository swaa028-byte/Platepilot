<?php
/**
 * PlatePilot theme functions.
 *
 * Self-contained: no build step, no external libraries. Registers the
 * navigation, a "PlatePilot" settings screen where the hosted-database and
 * payment-gateway credentials are entered, and shortcodes that read live
 * data through those credentials.
 *
 * Honest note: WordPress (and free PHP hosts) cannot run the ordering
 * engine itself — checkout verification and the kitchen display live in the
 * PlatePilot Node application, whose address is stored in the settings
 * below. This theme carries the site and reads published data.
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
	wp_enqueue_style( 'platepilot', get_stylesheet_uri(), array(), '1.0.0' );
	// Motion layer: GSAP for scroll reveals, three.js for the hero room.
	// Both come from a CDN so the theme stays dependency-free on disk.
	wp_enqueue_script( 'gsap', 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js', array(), '3.12.5', true );
	wp_enqueue_script( 'gsap-scrolltrigger', 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js', array( 'gsap' ), '3.12.5', true );
	wp_enqueue_script( 'three', 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js', array(), '0.160.0', true );
	wp_enqueue_script( 'platepilot-main', get_theme_file_uri( '/inc/main.js' ), array( 'gsap', 'gsap-scrolltrigger', 'three' ), '1.0.0', true );
}
add_action( 'wp_enqueue_scripts', 'platepilot_assets' );

/* ------------------------------------------------------------------ */
/* Settings: credentials the site and the app need                     */
/* ------------------------------------------------------------------ */

function platepilot_settings_fields() {
	return array(
		'app_url'            => array( 'label' => __( 'PlatePilot app address', 'platepilot' ), 'hint' => __( 'Where the ordering engine runs (the Node application). Ordering, checkout and the kitchen display live there; visitors are sent to it from this site.', 'platepilot' ), 'type' => 'url' ),
		'db_url'             => array( 'label' => __( 'Hosted database project URL', 'platepilot' ), 'hint' => __( 'The REST address of your hosted Postgres project (ends in .co or .com — no trailing slash).', 'platepilot' ), 'type' => 'url' ),
		'db_anon_key'        => array( 'label' => __( 'Hosted database public key', 'platepilot' ), 'hint' => __( 'The public (anon) key of that project. Only published data is readable with it.', 'platepilot' ), 'type' => 'text' ),
		'stripe_publishable' => array( 'label' => __( 'Stripe publishable key', 'platepilot' ), 'hint' => __( 'pk_live_… from your Stripe dashboard. Stored on your own server; never printed on the site.', 'platepilot' ), 'type' => 'text' ),
		'stripe_secret'      => array( 'label' => __( 'Stripe secret key', 'platepilot' ), 'hint' => __( 'sk_live_…. Entered in the PlatePilot app settings as well; stored here for the connection check only.', 'platepilot' ), 'type' => 'text' ),
		'paystack_public'    => array( 'label' => __( 'Paystack public key', 'platepilot' ), 'hint' => __( 'pk_live_… from your Paystack dashboard.', 'platepilot' ), 'type' => 'text' ),
		'paystack_secret'    => array( 'label' => __( 'Paystack secret key', 'platepilot' ), 'hint' => __( 'sk_live_….', 'platepilot' ), 'type' => 'text' ),
		'paypal_client_id'   => array( 'label' => __( 'PayPal client ID', 'platepilot' ), 'hint' => __( 'From your PayPal developer app.', 'platepilot' ), 'type' => 'text' ),
		'paypal_secret'      => array( 'label' => __( 'PayPal secret', 'platepilot' ), 'hint' => __( 'From your PayPal developer app.', 'platepilot' ), 'type' => 'text' ),
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

function platepilot_render_settings() {
	if ( ! current_user_can( 'manage_options' ) ) return;
	$missing = array();
	foreach ( platepilot_settings_fields() as $key => $field ) {
		if ( '' === platepilot_value( $key ) ) $missing[] = $field['label'];
	}
	?>
	<div class="wrap">
		<h1>PlatePilot</h1>
		<?php if ( $missing ) : ?>
			<div class="notice notice-warning"><p>
				<?php printf( esc_html( _n( 'Waiting for credentials: %s', 'Waiting for credentials: %s (and %d more)', count( $missing ) - 1 + 1, 'platepilot' ) ), esc_html( implode( ', ', array_slice( $missing, 0, 3 ) ) ), max( 0, count( $missing ) - 3 ) ); ?>
			</p></div>
		<?php else : ?>
			<div class="notice notice-success"><p><?php esc_html_e( 'All credentials present. The site is ready to receive users.', 'platepilot' ); ?></p></div>
		<?php endif; ?>
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
		<p><em><?php esc_html_e( 'Secrets are stored in your own database and are never printed on the public site.', 'platepilot' ); ?></em></p>
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
	if ( ! is_user_logged_in() ) {
		return '<p>' . esc_html__( 'Sign in as an administrator to see the connection status.', 'platepilot' ) . '</p>';
	}
	$rows = '';
	foreach ( platepilot_settings_fields() as $key => $field ) {
		$ok = '' !== platepilot_value( $key );
		$rows .= '<div class="flow-row ' . ( $ok ? 'is-in' : '' ) . '"><strong>' . esc_html( $field['label'] ) . '</strong><span>' .
			( $ok ? esc_html__( 'configured', 'platepilot' ) : esc_html__( 'missing — add it under PlatePilot in the dashboard', 'platepilot' ) ) . '</span></div>';
	}
	return '<div class="flow-list">' . $rows . '</div>';
}
add_shortcode( 'platepilot_status', 'platepilot_status_shortcode' );

/**
 * [platepilot_menu slug="la-divine-eden"] — renders a published menu read
 * live from the hosted database REST endpoint with the stored public key.
 * Read-only: ordering and checkout happen in the PlatePilot app.
 */
function platepilot_menu_shortcode( $atts ) {
	$atts = shortcode_atts( array( 'slug' => '' ), $atts, 'platepilot_menu' );
	$db_url = untrailingslashit( platepilot_value( 'db_url' ) );
	$anon   = platepilot_value( 'db_anon_key' );
	if ( '' === $atts['slug'] || '' === $db_url || '' === $anon ) {
		return current_user_can( 'manage_options' )
			? '<p><em>' . esc_html__( '[platepilot_menu] needs a slug, the hosted database URL and its public key (see PlatePilot in the dashboard).', 'platepilot' ) . '</em></p>'
			: '';
	}
	$response = wp_remote_get( $db_url . '/rest/v1/locations?select=id,name,address,currency,slug&slug=eq.' . rawurlencode( $atts['slug'] ), array(
		'headers' => array( 'apikey' => $anon, 'Authorization' => 'Bearer ' . $anon ),
		'timeout' => 8,
	) );
	if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
		return current_user_can( 'manage_options' ) ? '<p><em>' . esc_html__( 'The hosted database could not be reached. Check the URL and public key in the dashboard.', 'platepilot' ) . '</em></p>' : '';
	}
	$locations = json_decode( wp_remote_retrieve_body( $response ), true );
	if ( empty( $locations ) ) {
		return current_user_can( 'manage_options' ) ? '<p><em>' . esc_html__( 'No published location with that slug yet. Publish the menu from the PlatePilot app first.', 'platepilot' ) . '</em></p>' : '';
	}
	$location = $locations[0];
	$items_response = wp_remote_get( $db_url . '/rest/v1/menu_items?select=name,description,category,amount_minor,currency,allergens,available&location_id=eq.' . rawurlencode( $location['id'] ) . '&order=category.asc,name.asc', array(
		'headers' => array( 'apikey' => $anon, 'Authorization' => 'Bearer ' . $anon ),
		'timeout' => 8,
	) );
	$out  = '<div class="storefront-block"><h2>' . esc_html( $location['name'] ) . '</h2>';
	$out .= '<p class="locations-address">' . esc_html( $location['address'] ) . '</p>';
	if ( ! is_wp_error( $items_response ) && 200 === wp_remote_retrieve_response_code( $items_response ) ) {
		$items = json_decode( wp_remote_retrieve_body( $items_response ), true );
		$items = array_values( array_filter( (array) $items, function ( $item ) { return ! empty( $item['available'] ); } ) );
		$category = null;
		foreach ( $items as $item ) {
			if ( $category !== $item['category'] ) {
				$category = $item['category'];
				$out .= '<h3>' . esc_html( $category ) . '</h3><ul class="storefront-items">';
			}
			$amount = number_format( (float) $item['amount_minor'] / 100, 2 );
			$out .= '<li><span class="storefront-item-name">' . esc_html( $item['name'] ) .
				( ! empty( $item['description'] ) ? '<small>' . esc_html( $item['description'] ) . '</small>' : '' ) .
				'</span><span class="storefront-item-price">' . esc_html( $amount . ' ' . $item['currency'] ) . '</span></li>';
		}
		if ( $items ) $out .= '</ul>';
	}
	$app_url = untrailingslashit( platepilot_value( 'app_url' ) );
	if ( '' !== $app_url ) {
		$out .= '<p><a class="button" href="' . esc_url( $app_url . '/en/r/' . rawurlencode( $atts['slug'] ) ) . '">' . esc_html__( 'Order online', 'platepilot' ) . '</a></p>';
	}
	$out .= '</div>';
	return $out;
}
add_shortcode( 'platepilot_menu', 'platepilot_menu_shortcode' );
