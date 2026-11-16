package br.com.senac.recursos.reserva;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import br.com.senac.recursos.seguranca.Perfil;
import br.com.senac.recursos.seguranca.UsuarioAutenticado;

/**
 * RF-15 — lista reservas para a interface web. O Solicitante vê só as próprias;
 * Responsável e Administrador veem todas (para aprovar, registrar retirada e
 * devolução). As consultas são fixas: os filtros vão sempre por parâmetro.
 */
@RestController
public class ConsultaReservasController {

    /** Até 200 reservas, as mais recentes primeiro. */
    private static final String SQL_RESERVAS = """
            SELECT r.id, r.solicitante_id, u.name AS solicitante, r.inicio, r.fim, r.estado
            FROM reserva r JOIN app_user u ON u.id = r.solicitante_id
            WHERE (CAST(? AS uuid) IS NULL OR r.solicitante_id = CAST(? AS uuid))
              AND (CAST(? AS varchar) IS NULL OR r.estado = CAST(? AS varchar))
            ORDER BY r.inicio DESC, r.id
            LIMIT 200
            """;

    private static final String SQL_RECURSOS = """
            SELECT rr.reserva_id, rr.tipo_recurso, rr.recurso_id,
                   COALESCE(s.codigo, p.codigo, m.codigo) AS codigo
            FROM reserva_recurso rr
            LEFT JOIN sala s ON rr.tipo_recurso = 'SALA' AND s.id = rr.recurso_id
            LEFT JOIN professor p ON rr.tipo_recurso = 'PROFESSOR' AND p.id = rr.recurso_id
            LEFT JOIN material m ON rr.tipo_recurso = 'MATERIAL' AND m.id = rr.recurso_id
            WHERE rr.reserva_id = ANY (CAST(? AS uuid[]))
            ORDER BY rr.reserva_id, rr.tipo_recurso DESC, codigo
            """;

    private final JdbcTemplate jdbc;

    public ConsultaReservasController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record RecursoReservado(String tipo, UUID id, String codigo) {
    }

    public record ReservaResumo(UUID id, UUID solicitanteId, String solicitante, Instant inicio, Instant fim,
            EstadoReserva estado, List<RecursoReservado> recursos) {
    }

    @GetMapping("/api/v1/reservas")
    @Transactional(readOnly = true)
    public List<ReservaResumo> listar(@AuthenticationPrincipal UsuarioAutenticado usuario,
            @RequestParam(required = false) EstadoReserva estado) {
        UUID dono = usuario.perfil() == Perfil.SOLICITANTE ? usuario.id() : null;
        String filtroEstado = estado == null ? null : estado.name();

        var reservas = new LinkedHashMap<UUID, ReservaResumo>();
        jdbc.query(SQL_RESERVAS, linha -> {
            var id = linha.getObject("id", UUID.class);
            reservas.put(id, new ReservaResumo(id, linha.getObject("solicitante_id", UUID.class),
                    linha.getString("solicitante"),
                    linha.getObject("inicio", OffsetDateTime.class).toInstant(),
                    linha.getObject("fim", OffsetDateTime.class).toInstant(),
                    EstadoReserva.valueOf(linha.getString("estado")), new ArrayList<>()));
        }, dono, dono, filtroEstado, filtroEstado);

        if (!reservas.isEmpty()) {
            var ids = reservas.keySet().stream().map(UUID::toString).collect(Collectors.joining(",", "{", "}"));
            jdbc.query(SQL_RECURSOS, linha -> {
                reservas.get(linha.getObject("reserva_id", UUID.class)).recursos().add(new RecursoReservado(
                        linha.getString("tipo_recurso"), linha.getObject("recurso_id", UUID.class),
                        linha.getString("codigo")));
            }, ids);
        }
        return List.copyOf(reservas.values());
    }
}
