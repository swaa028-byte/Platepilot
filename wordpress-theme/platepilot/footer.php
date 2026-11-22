<?php
/**
 * Footer: brand column plus the three reference columns, language-free and
 * wired to whichever pages exist.
 */
if ( ! defined( 'ABSPATH' ) ) exit;
$columns = platepilot_footer_columns();
?>
</main>
<footer class="site-footer">
	<div class="shell footer-grid">
		<div class="footer-brand">
			<span class="brand brand--inverse">
				<svg class="brand-mark" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="#0b241d"/><circle cx="20" cy="20" r="12.5" fill="none" stroke="#fdfbf4" stroke-width="2.5"/><path d="M15 23l10-10" stroke="#cf6f3c" stroke-width="3" stroke-linecap="round"/></svg>
				<span>PlatePilot</span>
			</span>
			<p><?php esc_html_e( 'Your restaurant, from first order to close.', 'platepilot' ); ?></p>
			<span class="footer-status"><i></i><?php esc_html_e( 'Built for real service', 'platepilot' ); ?></span>
		</div>
		<?php foreach ( $columns as $title => $links ) : ?>
			<div class="footer-links">
				<strong><?php echo esc_html( $title ); ?></strong>
				<?php foreach ( $links as $link ) : if ( '' === $link[0] ) continue; ?>
					<a href="<?php echo esc_url( $link[0] ); ?>"><?php echo esc_html( $link[1] ); ?></a>
				<?php endforeach; ?>
			</div>
		<?php endforeach; ?>
		<div class="footer-locale"><span class="footer-status"><i></i><?php esc_html_e( 'Working brand · No clearance implied', 'platepilot' ); ?></span></div>
	</div>
	<div class="shell footer-bottom">
		<span>&copy; <?php echo esc_html( gmdate( 'Y' ) ); ?> PlatePilot</span>
	</div>
</footer>
<?php wp_footer(); ?>
</body>
</html>
