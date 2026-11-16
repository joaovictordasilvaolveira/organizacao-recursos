package br.com.senac.recursos.sala;

import java.util.UUID;

/**
 * {@code restrito} e {@code emManutencao} são só leitura: a interface web (RF-15)
 * mostra se a reserva vai precisar de aprovação (RF-07) ou se será recusada (RF-08).
 */
public record SalaResponse(
        UUID id,
        String codigo,
        String tipo,
        int capacidade,
        String localizacao,
        boolean restrito,
        boolean emManutencao) {

    public SalaResponse(UUID id, String codigo, String tipo, int capacidade, String localizacao) {
        this(id, codigo, tipo, capacidade, localizacao, false, false);
    }

    static SalaResponse from(Sala sala) {
        return new SalaResponse(
                sala.getId(),
                sala.getCodigo(),
                sala.getTipo(),
                sala.getCapacidade(),
                sala.getLocalizacao(),
                sala.isRestrito(),
                sala.isEmManutencao());
    }
}
