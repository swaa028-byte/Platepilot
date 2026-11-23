<?php
/** Template Name: About */
if ( ! defined( 'ABSPATH' ) ) exit;
get_header();
$c = platepilot_content()['about'];
platepilot_render_info_page( 'about', platepilot_start_url() );
?>
<section class="info-section info-section--tint">
	<div class="shell">
		<h2><?php echo esc_html( $c['whatTitle'] ); ?></h2>
		<p class="info-lede"><?php echo esc_html( $c['whatBody'] ); ?></p>
	</div>
</section>

<section class="info-section">
	<div class="shell">
		<h2><?php echo esc_html( $c['beliefTitle'] ); ?></h2>
		<ul class="belief-list">
			<?php foreach ( $c['beliefs'] as $belief ) : ?>
				<li><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><?php echo esc_html( $belief ); ?></li>
			<?php endforeach; ?>
		</ul>
	</div>
</section>

<section class="info-section info-section--tint" id="contact">
	<div class="shell">
		<h2><?php echo esc_html( $c['contactTitle'] ); ?></h2>
		<p class="info-lede"><?php echo esc_html( $c['contactBody'] ); ?></p>
		<div class="button-row" style="margin-top:28px">
			<a class="button" href="mailto:<?php echo esc_attr( $c['contactEmail'] ); ?>"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg><?php echo esc_html( $c['contactCta'] ); ?></a>
		</div>
	</div>
</section>
<?php get_footer(); ?>
