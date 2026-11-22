<?php
/** Fallback: any standard page renders as a simple info page. */
if ( ! defined( 'ABSPATH' ) ) exit;
get_header();
?>
<section class="info-hero">
	<div class="shell">
		<h1><?php echo esc_html( get_the_title() ); ?></h1>
	</div>
</section>
<section class="info-section">
	<div class="shell">
		<?php while ( have_posts() ) : the_post(); the_content(); endwhile; ?>
	</div>
</section>
<?php
get_footer();
