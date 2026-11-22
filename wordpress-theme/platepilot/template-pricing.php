<?php
/** Template Name: Pricing */
if ( ! defined( 'ABSPATH' ) ) exit;
get_header();
$c = platepilot_content()['pricing'];
$app_url = untrailingslashit( platepilot_value( 'app_url' ) );
$setup_url = $app_url ? $app_url . '/en/onboarding' : admin_url( 'admin.php?page=platepilot' );
platepilot_render_info_page( 'pricing', $setup_url );
?>
<section class="info-section info-section--tint">
	<div class="shell">
		<h2><?php echo esc_html( $c['includedTitle'] ); ?></h2>
		<p class="info-lede"><?php echo esc_html( $c['includedBody'] ); ?></p>
		<div class="info-grid info-grid--two">
			<?php foreach ( $c['included'] as $item ) : ?>
				<div class="info-card info-card--icon">
					<span class="info-card-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></span>
					<p><?php echo esc_html( $item ); ?></p>
				</div>
			<?php endforeach; ?>
		</div>
	</div>
</section>

<section class="info-section">
	<div class="shell">
		<h2><?php echo esc_html( $c['costsTitle'] ); ?></h2>
		<p class="info-lede"><?php echo esc_html( $c['costsBody'] ); ?></p>
		<div class="info-grid info-grid--two" style="max-width:900px">
			<?php foreach ( $c['costs'] as $cost ) : ?>
				<div class="info-card"><h3><?php echo esc_html( $cost[0] ); ?></h3><p><?php echo esc_html( $cost[1] ); ?></p></div>
			<?php endforeach; ?>
		</div>
	</div>
</section>

<section class="info-section info-section--tint">
	<div class="shell">
		<h2><?php echo esc_html( $c['compareTitle'] ); ?></h2>
		<table class="compare-table">
			<thead><tr><th scope="col" aria-label="&nbsp;"></th><th scope="col"><?php echo esc_html( $c['compareHosted'] ); ?></th><th scope="col"><?php echo esc_html( $c['comparePlatepilot'] ); ?></th></tr></thead>
			<tbody>
				<?php foreach ( $c['compare'] as $row ) : ?>
					<tr><td><?php echo esc_html( $row[0] ); ?></td><td><?php echo esc_html( $row[1] ); ?></td><td class="is-us"><?php echo esc_html( $row[2] ); ?></td></tr>
				<?php endforeach; ?>
			</tbody>
		</table>
	</div>
</section>

<?php
platepilot_render_faq( platepilot_content()['home']['faq'], $c['faqTitle'] );
platepilot_render_closing( $c['ctaTitle'], $c['ctaBody'], $c['cta'], $setup_url );
get_footer();
