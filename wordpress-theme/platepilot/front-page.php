<?php
/**
 * Front page: statement hero with the typed rotating word, trust strip, the
 * four service modes, the numbered walk-through, tabbed feature lists,
 * integrations, FAQ, and the green closing banner.
 */
if ( ! defined( 'ABSPATH' ) ) exit;
get_header();
$c = platepilot_content()['home'];
$app_url = untrailingslashit( platepilot_value( 'app_url' ) );
$setup_url = $app_url ? $app_url . '/en/onboarding' : admin_url( 'admin.php?page=platepilot' );
?>
<section class="cw-hero">
	<div class="cw-hero-glow" aria-hidden="true"></div>
	<div class="shell cw-hero-inner">
		<p class="eyebrow eyebrow--light eyebrow--center"><span></span><?php echo esc_html( $c['eyebrow'] ); ?></p>
		<h1><?php echo esc_html( $c['title'] ); ?><em><?php echo esc_html( $c['titleAccent'] ); ?></em></h1>
		<p class="cw-hero-rotate"><span class="cw-hero-rotate-lead">PlatePilot ·</span><span class="cw-rotate" data-words="<?php echo esc_attr( wp_json_encode( $c['rotate'] ) ); ?>"><span class="cw-rotate-text"></span><span class="cw-rotate-caret"></span></span></p>
		<p class="cw-lede"><?php echo esc_html( $c['lede'] ); ?></p>
		<div class="button-row">
			<a class="button button--light button--hero" href="<?php echo esc_url( $setup_url ); ?>"><?php echo esc_html( $c['primaryCta'] ); ?><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
			<?php if ( $app_url ) : ?><a class="button button--outline-light" href="<?php echo esc_url( $app_url . '/en/operations' ); ?>"><?php echo esc_html( $c['secondaryCta'] ); ?></a><?php endif; ?>
		</div>
		<p class="cw-hero-note"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><?php echo esc_html( $c['note'] ); ?></p>
	</div>
</section>

<section class="trust-strip">
	<div class="shell trust-strip-inner">
		<?php foreach ( $c['strip'] as $item ) : ?>
			<span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><?php echo esc_html( $item ); ?></span>
		<?php endforeach; ?>
	</div>
</section>

<section class="section cw-modes">
	<div class="shell">
		<div class="cw-center-head"><h2><?php esc_html_e( 'One system that does it all.', 'platepilot' ); ?></h2></div>
		<div class="cw-mode-grid">
			<?php foreach ( $c['modes'] as $mode ) : ?>
				<article class="cw-mode-card">
					<span class="cw-mode-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v8"/></svg></span>
					<h3><?php echo esc_html( $mode[0] ); ?></h3>
					<p><?php echo esc_html( $mode[1] ); ?></p>
				</article>
			<?php endforeach; ?>
		</div>
	</div>
</section>

<section class="section cw-steps">
	<div class="shell">
		<div class="cw-center-head"><h2><?php esc_html_e( 'Less switching. More serving.', 'platepilot' ); ?></h2></div>
		<div class="cw-step-list">
			<?php foreach ( $c['steps'] as $step ) : ?>
				<div class="cw-step">
					<div class="cw-step-copy">
						<span class="cw-step-num"><?php echo esc_html( $step[0] ); ?></span>
						<h3><?php echo esc_html( $step[1] ); ?></h3>
						<p><?php echo esc_html( $step[2] ); ?></p>
					</div>
					<div class="cw-step-visual"><div class="pay-mock" role="presentation"></div></div>
				</div>
			<?php endforeach; ?>
		</div>
	</div>
</section>

<section class="section cw-tabs">
	<div class="shell">
		<div class="cw-center-head"><h2><?php esc_html_e( 'Features that carry a busy service.', 'platepilot' ); ?></h2></div>
		<div class="cw-tab-bar" role="tablist">
			<?php foreach ( $c['tabs'] as $i => $tab ) : ?>
				<button type="button" role="tab" data-tab="<?php echo esc_attr( $i ); ?>" aria-selected="<?php echo 0 === $i ? 'true' : 'false'; ?>"><?php echo esc_html( $tab[0] ); ?></button>
			<?php endforeach; ?>
		</div>
		<?php foreach ( $c['tabs'] as $i => $tab ) : ?>
			<div class="cw-tab-panel" role="tabpanel" data-panel="<?php echo esc_attr( $i ); ?>"<?php echo 0 === $i ? '' : ' hidden'; ?>>
				<div class="cw-tab-copy"><h3><?php echo esc_html( $tab[1] ); ?></h3><p><?php echo esc_html( $tab[2] ); ?></p></div>
				<ul class="cw-tab-points">
					<?php foreach ( $tab[3] as $point ) : ?>
						<li><span class="cw-point-check"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></span><?php echo esc_html( $point ); ?></li>
					<?php endforeach; ?>
				</ul>
			</div>
		<?php endforeach; ?>
	</div>
</section>

<section class="section cw-integrations">
	<div class="shell">
		<div class="cw-center-head">
			<h2><?php echo esc_html( $c['integrationsTitle'] ); ?></h2>
			<p class="cw-section-lede"><?php echo esc_html( $c['integrationsBody'] ); ?></p>
		</div>
		<ul class="cw-integration-row">
			<?php foreach ( $c['integrations'] as $name ) : ?>
				<li class="cw-integration-chip"><?php echo esc_html( $name ); ?></li>
			<?php endforeach; ?>
		</ul>
	</div>
</section>

<section class="section cw-faq">
	<div class="shell">
		<div class="cw-center-head"><h2><?php esc_html_e( 'Frequently asked questions', 'platepilot' ); ?></h2></div>
		<div class="cw-faq-list">
			<?php foreach ( $c['faq'] as $faq ) : ?>
				<details class="cw-faq-item">
					<summary><?php echo esc_html( $faq[0] ); ?><span aria-hidden="true"></span></summary>
					<p><?php echo esc_html( $faq[1] ); ?></p>
				</details>
			<?php endforeach; ?>
		</div>
	</div>
</section>

<section class="closing-section">
	<div class="shell closing-inner">
		<p class="eyebrow eyebrow--light eyebrow--center"><span></span>PLATEPILOT</p>
		<h2><?php echo esc_html( $c['closingTitle'] ); ?></h2>
		<p><?php echo esc_html( $c['closingBody'] ); ?></p>
		<a class="button button--light button--hero" href="<?php echo esc_url( $setup_url ); ?>"><?php echo esc_html( $c['closingCta'] ); ?><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
	</div>
</section>
<?php get_footer(); ?>
