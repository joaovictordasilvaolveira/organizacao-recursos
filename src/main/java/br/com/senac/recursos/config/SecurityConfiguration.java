package br.com.senac.recursos.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

import com.fasterxml.jackson.databind.ObjectMapper;

import br.com.senac.recursos.seguranca.Perfil;
import br.com.senac.recursos.seguranca.RespostaAcessoNegado;

/**
 * Autorização negada por padrão (ADR 0002). Escrita no catálogo de recursos
 * é exclusiva do Administrador; consultas exigem apenas autenticação.
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfiguration {

    private static final String[] CATALOGO = {
        "/api/v1/salas/**", "/api/v1/professores/**", "/api/v1/materiais/**"
    };

    /** Interface web (RF-15): só arquivos estáticos; os dados continuam exigindo login. */
    private static final String[] INTERFACE_WEB = {
        "/", "/index.html", "/app.js", "/app.css", "/favicon.svg"
    };

    /**
     * Só script e estilo do próprio servidor, sem inline nem eval: um texto
     * malicioso salvo num cadastro não consegue rodar como código (XSS).
     */
    static final String CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
            + "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, ObjectMapper objectMapper) throws Exception {
        var respostaNegada = new RespostaAcessoNegado(objectMapper);
        return http
                // CSRF desligado de propósito: API sem sessão e sem cookie (STATELESS,
                // HTTP Basic). Justificativa e riscos no ADR 0006.
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers("/actuator/health", "/api/v1/status").permitAll()
                        .requestMatchers(HttpMethod.GET, INTERFACE_WEB).permitAll()
                        .requestMatchers(HttpMethod.GET, CATALOGO).authenticated()
                        .requestMatchers(CATALOGO).hasRole(Perfil.ADMINISTRADOR.name())
                        .anyRequest().authenticated())
                .headers(headers -> headers.contentSecurityPolicy(csp -> csp.policyDirectives(CSP)))
                .httpBasic(basic -> basic.authenticationEntryPoint(respostaNegada))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(respostaNegada)
                        .accessDeniedHandler(respostaNegada))
                .build();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
