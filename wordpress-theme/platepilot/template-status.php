<?php
/** Template Name: Connection status */
if ( ! defined( 'ABSPATH' ) ) exit;
get_header();
?>
<section class="info-hero">
	<div class="shell">
		<p class="eyebrow"><span></span><?php esc_html_e( 'CONNECTION', 'platepilot' ); ?></p>
		<h1><?php esc_html_e( 'Is the site ready to receive users?', 'platepilot' ); ?></h1>
		<p class="cw-lede"><?php esc_html_e( 'Everything the site and the ordering engine need, checked in one place. This page shows details only to signed-in administrators.', 'platepilot' ); ?></p>
	</div>
</section>
<section class="info-section">
	<div class="shell">
		<?php echo do_shortcode( '[platepilot_status]' ); ?>
		<p class="info-lede" style="margin-top:34px"><?php esc_html_e( 'Show a live, published menu anywhere with:', 'platepilot' ); ?> <code>[platepilot_menu slug="your-restaurant"]</code></p>
	</div>
</section>
<?php
get_footer();
