<?php
/** Template Name: How it works */
if ( ! defined( 'ABSPATH' ) ) exit;
get_header();
$c = platepilot_content()['how'];
$app_url = untrailingslashit( platepilot_value( 'app_url' ) );
$setup_url = platepilot_start_url();
platepilot_render_info_page( 'how', $setup_url );
?>
<section class="info-section info-section--tint">
	<div class="shell">
		<h2><?php echo esc_html( $c['setupTitle'] ); ?></h2>
		<p class="info-lede"><?php echo esc_html( $c['setupBody'] ); ?></p>
		<ol class="step-list">
			<?php foreach ( $c['steps'] as $i => $step ) : ?>
				<li class="step-row">
					<span class="step-row-num"><?php echo esc_html( $i + 1 ); ?></span>
					<div><h3><?php echo esc_html( $step[0] ); ?></h3><p><?php echo esc_html( $step[1] ); ?></p></div>
				</li>
			<?php endforeach; ?>
		</ol>
	</div>
</section>

<section class="info-section">
	<div class="shell">
		<h2><?php echo esc_html( $c['guestTitle'] ); ?></h2>
		<p class="info-lede"><?php echo esc_html( $c['guestBody'] ); ?></p>
		<div class="journey" role="list">
			<?php foreach ( $c['guest'] as $i => $step ) : ?>
				<div class="journey-step" role="listitem"><i><?php echo esc_html( $i + 1 ); ?></i><span><?php echo esc_html( $step ); ?></span></div>
			<?php endforeach; ?>
		</div>
	</div>
</section>

<section class="info-section info-section--tint">
	<div class="shell">
		<h2><?php echo esc_html( $c['flowTitle'] ); ?></h2>
		<p class="info-lede"><?php echo esc_html( $c['flowBody'] ); ?></p>
		<div class="flow-list">
			<?php foreach ( $c['flows'] as $flow ) : ?>
				<div class="flow-row <?php echo esc_attr( 'in' === $flow[0] ? 'is-in' : 'is-out' ); ?>">
					<span><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg></span>
					<span><?php echo esc_html( $flow[1] ); ?></span>
				</div>
			<?php endforeach; ?>
		</div>
	</div>
</section>

<?php
platepilot_render_faq( platepilot_content()['home']['faq'], $c['faqTitle'] );
platepilot_render_closing( $c['ctaTitle'], $c['ctaBody'], $c['cta'], $setup_url );
get_footer();
