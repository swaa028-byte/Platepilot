<?php
/**
 * Template Name: PlatePilot feature page
 *
 * One template for the app-feature pages (operations, kitchen, table codes,
 * floor planner, security, restaurant pages, reports). They share a shape -
 * eyebrow, title, lede, two or three sections with a short list, then three
 * cards - so the words live in inc/content.php under the page slug and this
 * file only decides the layout. A page whose slug has no content entry falls
 * back to the editor, so the template never renders an empty page.
 */
if ( ! defined( 'ABSPATH' ) ) exit;
get_header();

$slug = get_post_field( 'post_name', get_the_ID() );
$c = platepilot_content();

if ( ! isset( $c[ $slug ] ) || empty( $c[ $slug ]['sections'] ) ) {
	while ( have_posts() ) {
		the_post();
		?>
		<section class="info-section">
			<div class="shell">
				<h1><?php the_title(); ?></h1>
				<?php the_content(); ?>
			</div>
		</section>
		<?php
	}
	get_footer();
	return;
}

$page = $c[ $slug ];
platepilot_render_info_page( $slug, platepilot_start_url() );

foreach ( $page['sections'] as $index => $section ) :
	$tinted = 0 === $index % 2;
	?>
	<section class="info-section<?php echo $tinted ? ' info-section--tint' : ''; ?>">
		<div class="shell">
			<h2><?php echo esc_html( $section[0] ); ?></h2>
			<p class="info-lede"><?php echo esc_html( $section[1] ); ?></p>
			<?php if ( ! empty( $section[2] ) ) : ?>
				<ul class="belief-list">
					<?php foreach ( $section[2] as $point ) : ?>
						<li><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><?php echo esc_html( $point ); ?></li>
					<?php endforeach; ?>
				</ul>
			<?php endif; ?>
		</div>
	</section>
	<?php
endforeach;

if ( ! empty( $page['cards'] ) ) :
	?>
	<section class="info-section info-section--tint">
		<div class="shell">
			<h2><?php echo esc_html( $page['cardsTitle'] ?? 'What it changes for you' ); ?></h2>
			<div class="info-grid info-grid--two">
				<?php foreach ( $page['cards'] as $card ) : ?>
					<div class="info-card">
						<h3><?php echo esc_html( $card[0] ); ?></h3>
						<p><?php echo esc_html( $card[1] ); ?></p>
					</div>
				<?php endforeach; ?>
			</div>
		</div>
	</section>
	<?php
endif;

get_footer();
