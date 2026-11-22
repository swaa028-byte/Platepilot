<?php
/**
 * A generic renderer for the six info pages. Each template file simply
 * selects its section of content; the layout classes match the Next.js
 * application one for one.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

function platepilot_render_info_page( $key, $setup_url ) {
	$c = platepilot_content()[ $key ];
	$app_url = untrailingslashit( platepilot_value( 'app_url' ) );
	?>
	<section class="info-hero">
		<div class="shell">
			<p class="eyebrow"><span></span><?php echo esc_html( $c['eyebrow'] ); ?></p>
			<h1><?php echo esc_html( $c['title'] ); ?></h1>
			<p class="cw-lede"><?php echo esc_html( $c['lede'] ); ?></p>
		</div>
	</section>
	<?php
	// Section set per page, rendered below by the template-specific loops
	// kept in this file for clarity.
}

function platepilot_render_faq( $faqs, $title ) {
	?>
	<section class="info-section">
		<div class="shell">
			<h2><?php echo esc_html( $title ); ?></h2>
			<div class="cw-faq-list">
				<?php foreach ( $faqs as $faq ) : ?>
					<details class="cw-faq-item">
						<summary><?php echo esc_html( $faq[0] ); ?><span aria-hidden="true"></span></summary>
						<p><?php echo esc_html( $faq[1] ); ?></p>
					</details>
				<?php endforeach; ?>
			</div>
		</div>
	</section>
	<?php
}

function platepilot_render_closing( $title, $body, $cta, $url ) {
	?>
	<section class="closing-section">
		<div class="shell closing-inner">
			<p class="eyebrow eyebrow--light eyebrow--center"><span></span>PLATEPILOT</p>
			<h2><?php echo esc_html( $title ); ?></h2>
			<p><?php echo esc_html( $body ); ?></p>
			<a class="button button--light button--hero" href="<?php echo esc_url( $url ); ?>"><?php echo esc_html( $cta ); ?><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
		</div>
	</section>
	<?php
}
