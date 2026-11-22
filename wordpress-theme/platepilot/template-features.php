<?php
/** Template Name: Features */
if ( ! defined( 'ABSPATH' ) ) exit;
$c = platepilot_content()['features'];
$home = platepilot_content()['home'];
$app_url = untrailingslashit( platepilot_value( 'app_url' ) );
$setup_url = $app_url ? $app_url . '/en/onboarding' : admin_url( 'admin.php?page=platepilot' );
platepilot_render_info_page( 'features', $setup_url );
?>
<section class="info-section info-section--tint">
	<div class="shell">
		<h2><?php echo esc_html( $c['modesTitle'] ); ?></h2>
		<p class="info-lede"><?php echo esc_html( $c['modesBody'] ); ?></p>
		<div class="cw-mode-grid">
			<?php foreach ( $home['modes'] as $mode ) : ?>
				<article class="cw-mode-card">
					<span class="cw-mode-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v8"/></svg></span>
					<h3><?php echo esc_html( $mode[0] ); ?></h3>
					<p><?php echo esc_html( $mode[1] ); ?></p>
				</article>
			<?php endforeach; ?>
		</div>
	</div>
</section>

<section class="info-section">
	<div class="shell">
		<h2><?php echo esc_html( $c['coreTitle'] ); ?></h2>
		<p class="info-lede"><?php echo esc_html( $c['coreBody'] ); ?></p>
		<div class="info-grid info-grid--two">
			<?php foreach ( $c['core'] as $item ) : ?>
				<div class="info-card"><h3><?php echo esc_html( $item[0] ); ?></h3><p><?php echo esc_html( $item[1] ); ?></p></div>
			<?php endforeach; ?>
		</div>
	</div>
</section>

<section class="info-section info-section--tint">
	<div class="shell">
		<h2><?php echo esc_html( $c['boxTitle'] ); ?></h2>
		<p class="info-lede"><?php echo esc_html( $c['boxBody'] ); ?></p>
		<div class="info-grid">
			<?php foreach ( $c['box'] as $item ) : ?>
				<div class="info-card"><p style="margin:0;font-weight:600;color:#3f4d45"><?php echo esc_html( $item ); ?></p></div>
			<?php endforeach; ?>
		</div>
	</div>
</section>

<?php platepilot_render_closing( $c['ctaTitle'], $c['ctaBody'], $c['cta'], $setup_url ); ?>
