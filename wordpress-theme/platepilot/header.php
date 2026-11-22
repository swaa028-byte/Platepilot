<?php
/**
 * Site header: brand at the left, two grouped dropdown menus, and the
 * language-neutral actions at the right — the reference header pattern.
 */
if ( ! defined( 'ABSPATH' ) ) exit;
$nav = platepilot_nav();
$app_url = untrailingslashit( platepilot_value( 'app_url' ) );
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo( 'charset' ); ?>" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<a class="skip-link" href="#main-content"><?php esc_html_e( 'Skip to content', 'platepilot' ); ?></a>
<header class="site-header">
	<div class="shell header-inner">
		<a class="brand" href="<?php echo esc_url( home_url( '/' ) ); ?>">
			<svg class="brand-mark" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="#173f35"/><circle cx="20" cy="20" r="12.5" fill="none" stroke="#fdfbf4" stroke-width="2.5"/><path d="M15 23l10-10" stroke="#cf6f3c" stroke-width="3" stroke-linecap="round"/></svg>
			<span>PlatePilot</span>
		</a>
		<button type="button" class="icon-button mobile-menu-button" aria-expanded="false" aria-controls="main-navigation">
			<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
		</button>
		<div id="main-navigation" class="header-navigation">
			<nav class="main-nav main-nav--drop" aria-label="<?php esc_attr_e( 'Main navigation', 'platepilot' ); ?>">
				<div class="nav-group">
					<button type="button" class="nav-drop-btn" aria-expanded="false" aria-haspopup="true"><?php esc_html_e( 'Product', 'platepilot' ); ?><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
					<div class="nav-drop">
						<?php foreach ( $nav['product'] as $item ) : ?>
							<a href="<?php echo esc_url( $app_url ? $app_url . '/en/' . $item[0] : home_url( '/' ) ); ?>"><?php echo esc_html( $item[1] ); ?></a>
						<?php endforeach; ?>
					</div>
				</div>
				<div class="nav-group">
					<button type="button" class="nav-drop-btn" aria-expanded="false" aria-haspopup="true"><?php esc_html_e( 'Resources', 'platepilot' ); ?><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
					<div class="nav-drop">
						<?php foreach ( $nav['resources'] as $item ) : ?>
							<a href="<?php echo esc_url( $app_url ? $app_url . '/en/' . $item[0] : home_url( '/' ) ); ?>"><?php echo esc_html( $item[1] ); ?></a>
						<?php endforeach; ?>
					</div>
				</div>
			</nav>
			<nav class="main-nav main-nav--flat" aria-label="<?php esc_attr_e( 'Main navigation', 'platepilot' ); ?>">
				<?php foreach ( array_merge( array( array( 'features', 'Product' ) ), $nav['product'], $nav['resources'] ) as $item ) : ?>
					<a href="<?php echo esc_url( $app_url ? $app_url . '/en/' . $item[0] : home_url( '/' ) ); ?>"><?php echo esc_html( $item[1] ); ?></a>
				<?php endforeach; ?>
			</nav>
			<div class="header-actions">
				<?php if ( $app_url ) : ?>
					<a class="text-link sign-in-link" href="<?php echo esc_url( $app_url . '/en/login' ); ?>"><?php esc_html_e( 'Sign in', 'platepilot' ); ?></a>
					<a class="button button--small" href="<?php echo esc_url( $app_url . '/en/onboarding' ); ?>"><?php esc_html_e( 'Start setup', 'platepilot' ); ?><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg></a>
				<?php else : ?>
					<a class="button button--small" href="<?php echo esc_url( admin_url( 'admin.php?page=platepilot' ) ); ?>"><?php esc_html_e( 'Connect', 'platepilot' ); ?></a>
				<?php endif; ?>
			</div>
		</div>
	</div>
</header>
<main id="main-content">
