<?php
/**
 * Template Name: Restaurant directory
 *
 * The public listing: every restaurant with a published menu, read through the
 * database's public_directory() function and linked to the ordering app where
 * that restaurant lives. A restaurant without a published menu is not listed -
 * a directory that sends a guest to an empty page is worse than no directory.
 */
if ( ! defined( 'ABSPATH' ) ) exit;
get_header();

$app_url   = untrailingslashit( platepilot_value( 'app_url' ) );
$directory = platepilot_fetch_directory();
$is_error  = is_wp_error( $directory );
$places    = $is_error ? array() : $directory;
?>
<section class="dir-hero">
	<div class="shell">
		<p class="eyebrow"><span></span><?php esc_html_e( 'Restaurants on PlatePilot', 'platepilot' ); ?></p>
		<h1><?php esc_html_e( 'Every restaurant, one click away.', 'platepilot' ); ?></h1>
		<p class="dir-lede"><?php esc_html_e( 'Each one runs its own shop: its own menu, its own prices, its own staff. Open a card to see what is cooking tonight.', 'platepilot' ); ?></p>
		<?php if ( ! $is_error ) : ?>
			<p class="dir-count">
				<?php
				printf(
					esc_html( _n( '%s restaurant taking orders', '%s restaurants taking orders', count( $places ), 'platepilot' ) ),
					esc_html( number_format_i18n( count( $places ) ) )
				);
				?>
			</p>
		<?php endif; ?>
	</div>
</section>

<section class="dir-body">
	<div class="shell">
		<?php if ( $is_error ) : ?>
			<div class="dir-empty">
				<h2><?php esc_html_e( 'The directory is not connected yet.', 'platepilot' ); ?></h2>
				<p><?php echo esc_html( $is_error->get_error_message() ); ?></p>
			</div>
		<?php elseif ( empty( $places ) ) : ?>
			<div class="dir-empty">
				<h2><?php esc_html_e( 'No restaurant has published a menu yet.', 'platepilot' ); ?></h2>
				<p><?php esc_html_e( 'Publish a menu in the ordering app and it appears here within a minute.', 'platepilot' ); ?></p>
			</div>
		<?php else : ?>
			<ul class="dir-grid">
				<?php foreach ( $places as $place ) : ?>
					<?php
					$slug = isset( $place['slug'] ) ? (string) $place['slug'] : '';
					if ( '' === $slug ) continue;
					$menu_url  = '' !== $app_url ? $app_url . '/en/r/' . rawurlencode( $slug ) : '';
					$order_url = '' !== $app_url ? $app_url . '/en/r/' . rawurlencode( $slug ) . '/menu' : '';
					$image     = isset( $place['leadImage'] ) ? (string) $place['leadImage'] : '';
					$items     = isset( $place['items'] ) ? (int) $place['items'] : 0;
					$from      = isset( $place['fromMinor'] ) ? (string) $place['fromMinor'] : '';
					$currency  = isset( $place['currency'] ) ? (string) $place['currency'] : '';
					$ordering  = ! empty( $place['ordering'] );
					?>
					<li class="dir-card">
						<a class="dir-card-media" href="<?php echo esc_url( $menu_url ? $menu_url : '#' ); ?>" aria-hidden="true" tabindex="-1">
							<?php if ( '' !== $image ) : ?>
								<img src="<?php echo esc_url( $image ); ?>" alt="" loading="lazy" decoding="async" />
							<?php else : ?>
								<span class="dir-card-plate" aria-hidden="true"><?php echo esc_html( platepilot_initial( $place['name'] ?? '' ) ); ?></span>
							<?php endif; ?>
						</a>
						<div class="dir-card-body">
							<h2 class="dir-card-title">
								<a href="<?php echo esc_url( $menu_url ? $menu_url : '#' ); ?>"><?php echo esc_html( (string) ( $place['name'] ?? '' ) ); ?></a>
							</h2>
							<p class="dir-card-address"><?php echo esc_html( (string) ( $place['address'] ?? '' ) ); ?></p>
							<?php $hours = platepilot_hours_lines( $place['hours'] ?? null ); ?>
							<?php if ( $hours ) : ?>
								<ul class="dir-card-hours">
									<?php foreach ( $hours as $line ) : ?>
										<li><?php echo esc_html( $line ); ?></li>
									<?php endforeach; ?>
								</ul>
							<?php endif; ?>
							<p class="dir-card-meta">
								<?php
								if ( $items > 0 ) {
									printf( esc_html( _n( '%s dish', '%s dishes', $items, 'platepilot' ) ), esc_html( number_format_i18n( $items ) ) );
								}
								if ( '' !== $from && '' !== $currency ) {
									echo ' &middot; ';
									printf( esc_html__( 'from %s', 'platepilot' ), esc_html( platepilot_money( $from, $currency ) ) );
								}
								?>
							</p>
							<div class="dir-card-actions">
								<?php if ( $ordering && '' !== $order_url ) : ?>
									<a class="button dir-card-cta" href="<?php echo esc_url( $order_url ); ?>"><?php esc_html_e( 'Order online', 'platepilot' ); ?></a>
								<?php else : ?>
									<span class="dir-card-closed"><?php esc_html_e( 'Walk in only', 'platepilot' ); ?></span>
								<?php endif; ?>
								<?php if ( '' !== $menu_url ) : ?>
									<a class="dir-card-link" href="<?php echo esc_url( $menu_url ); ?>"><?php esc_html_e( 'See the menu', 'platepilot' ); ?></a>
								<?php endif; ?>
							</div>
						</div>
					</li>
				<?php endforeach; ?>
			</ul>
		<?php endif; ?>

		<div class="dir-invite">
			<div>
				<h2><?php esc_html_e( 'Not on the list yet?', 'platepilot' ); ?></h2>
				<p><?php esc_html_e( 'Open your own shop in two minutes. Two hundred orders a month are free, and we never take a commission.', 'platepilot' ); ?></p>
			</div>
			<a class="button" href="<?php echo esc_url( platepilot_start_url() ); ?>"><?php esc_html_e( 'Open your restaurant', 'platepilot' ); ?></a>
		</div>
	</div>
</section>
<?php get_footer(); ?>
