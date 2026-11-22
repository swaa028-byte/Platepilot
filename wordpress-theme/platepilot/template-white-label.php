<?php
/** Template Name: White label */
if ( ! defined( 'ABSPATH' ) ) exit;
$c = platepilot_content()['whitelabel'];
$app_url = untrailingslashit( platepilot_value( 'app_url' ) );
$setup_url = $app_url ? $app_url . '/en/onboarding' : admin_url( 'admin.php?page=platepilot' );
platepilot_render_info_page( 'whitelabel', $setup_url );
?>
<section class="info-section info-section--tint">
	<div class="shell">
		<div class="info-grid info-grid--two">
			<?php foreach ( $c['points'] as $point ) : ?>
				<div class="info-card"><h3><?php echo esc_html( $point[0] ); ?></h3><p><?php echo esc_html( $point[1] ); ?></p></div>
			<?php endforeach; ?>
		</div>
	</div>
</section>

<section class="info-section">
	<div class="shell">
		<h2><?php echo esc_html( $c['trustTitle'] ); ?></h2>
		<p class="info-lede"><?php echo esc_html( $c['trustBody'] ); ?></p>
		<ul class="belief-list">
			<?php foreach ( $c['trust'] as $item ) : ?>
				<li><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><?php echo esc_html( $item ); ?></li>
			<?php endforeach; ?>
		</ul>
	</div>
</section>

<?php platepilot_render_closing( $c['ctaTitle'], $c['ctaBody'], $c['cta'], $setup_url ); ?>
