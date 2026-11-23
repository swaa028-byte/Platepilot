<?php
/** Template Name: Integrations */
if ( ! defined( 'ABSPATH' ) ) exit;
get_header();
$c = platepilot_content()['integrations'];
platepilot_render_info_page( 'integrations', platepilot_start_url() );
?>
<section class="info-section info-section--tint">
	<div class="shell">
		<?php foreach ( $c['groups'] as $group ) : ?>
			<div class="int-group">
				<div class="int-group-head">
					<h3><?php echo esc_html( $group[0] ); ?></h3>
					<p><?php echo esc_html( $group[1] ); ?></p>
				</div>
				<div class="int-chips">
					<?php foreach ( $group[2] as $chip ) : ?>
						<span class="int-chip"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><?php echo esc_html( $chip ); ?></span>
					<?php endforeach; ?>
				</div>
			</div>
		<?php endforeach; ?>
		<p class="info-lede" style="margin-top:40px"><?php echo esc_html( $c['docsNote'] ); ?></p>
	</div>
</section>

<?php platepilot_render_closing( $c['ctaTitle'], $c['ctaBody'], $c['cta'], platepilot_start_url() ); ?>
<?php get_footer(); ?>
